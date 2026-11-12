import {configuration,scope,type Config} from './config.ts';
import {historicalPeriod,reportPeriod,duePeriods} from './scheduler.ts';
import {Storage,type Disk} from './storage.ts';import {Collector} from './collector.ts';import {Dispatch} from './dispatch.ts';
import {normalizeEvents,hash} from './events.ts';import {reportLines,paginate} from './format-report.ts';
import {safeText,type Period,type Kind,type RecordEntry,type Report,type RPC} from './domain.ts';
import {timingSafeEqual} from 'node:crypto';import {Buffer} from 'node:buffer';
export const BASE='/api/plugins/komari-daily-weekly-reports';
export interface Server extends RPC {getConfig():Promise<Record<string,unknown>>;cron(expr:string,fn:()=>void):unknown;route(method:string,path:string,handler:(req:any,res:any)=>unknown):unknown}
export class App {
 server:Server;storage:Storage;collector:Collector;dispatch:Dispatch;config!:Config;stopped=false;busy=false;lastError='';lastTick:number|null=null;task:Promise<void>|null=null;
 jobs=new Map<string,{status:string;result?:unknown;error?:string}>();queue:Promise<void>=Promise.resolve();
 constructor(server:Server,fs:Disk,root:string){this.server=server;this.storage=new Storage(fs,root);this.collector=new Collector(server,this.storage);this.dispatch=new Dispatch(server,this.storage);}
 async load(){
  this.config=configuration(await this.server.getConfig());reportPeriod(Date.now(),this.config.timezone,'daily');
  this.server.route('GET',BASE+'/status',(req,res)=>this.admin(req,res,()=>this.status()));
  this.server.route('GET',BASE+'/jobs',(req,res)=>this.admin(req,res,()=>this.jobs.get(String(req.query?.id))||{status:'not_found'}));
  this.server.route('GET',BASE+'/export',(req,res)=>this.admin(req,res,()=>{this.storage.streamBackup(res);}));
  this.server.route('POST',BASE+'/action',(req,res)=>this.admin(req,res,()=>this.enqueue(this.body(req))));
  this.server.route('POST',BASE+'/events',async(req,res)=>{
   try{const c=configuration(await this.server.getConfig());const supplied=req.headers?.authorization;
    if(!c.eventForwarding||!this.secret(supplied,c.eventSecret)){this.json(res,{error:'unauthorized'},401);return;}
    const raw=this.body(req),events=normalizeEvents(raw);let added=0;for(const e of events)if(this.storage.event(e))added++;this.json(res,{accepted:added});
   }catch{this.json(res,{error:'invalid event or storage failure'},400);}
  });
  this.server.cron('@every 1m',()=>{if(!this.busy&&!this.stopped)this.task=this.tick().catch(e=>this.fail(e));});
  this.task=this.tick().catch(e=>this.fail(e));
 }
 secret(supplied:unknown,secret:string){if(typeof supplied!=='string'||secret.length<32)return false;const a=Buffer.from(supplied),b=Buffer.from('Bearer '+secret);return a.length===b.length&&timingSafeEqual(a,b);}
 body(req:any){if(typeof req.body!=='string'||req.body.length>32768)throw Error('请求体过大或无效');return JSON.parse(req.body);}
 json(res:any,data:unknown,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
 admin(req:any,res:any,fn:()=>unknown){
  const roles=req.context?.principal?.roles||[];if(!roles.includes('admin')){this.json(res,{error:'需要管理员身份'},403);return;}
  // Requests with ambient cookies must be same-origin; do not accept cross-site mutations.
  const origin=req.headers?.origin,host=req.headers?.host;
  if(req.method==='POST'&&origin){try{if(new URL(origin).host!==host)throw Error();}catch{this.json(res,{error:'跨站请求被拒绝'},403);return;}}
  try{const data=fn();if(data!==undefined)this.json(res,data);}catch(e){this.json(res,{error:safeText(e instanceof Error?e.message:'操作失败')},400);}
 }
 fail(e:unknown){this.lastError=safeText(e instanceof Error?e.message:'未知错误');try{this.storage.log(this.lastError);}catch{}console.error(this.lastError);}
 status(){const records=this.storage.records().sort((a,b)=>b.generated-a.generated);return {version:'0.1.0-beta.1',busy:this.busy,lastTick:this.lastTick,lastError:this.lastError,lastGenerated:records[0]?.generated??null,lastAccepted:records.find(x=>x.status==='accepted')?.finished??null,notificationSemantics:'accepted 仅表示 Komari RPC 正常返回；可能被全局禁用或渠道脚本忽略，不保证 Telegram 送达。',records:records.slice(0,100).map(r=>({id:r.id,kind:r.kind,period:r.period,status:r.status,generated:r.generated,finished:r.finished,complete:r.complete,parts:r.parts.map(p=>({state:p.state,attempts:p.attempts,error:p.error})),error:r.error})),logs:this.storage.read('logs.json',[])};}
 enqueue(input:any){
  if(!input||!['preview','send','test','retry'].includes(input.action))throw Error('操作无效');
  if(this.jobs.size>=30){const first=[...this.jobs].find(([,v])=>v.status!=='running'&&v.status!=='queued');if(first)this.jobs.delete(first[0]);else throw Error('任务队列已满');}
  if(input.action!=='test'&&input.action!=='retry'&&(!['daily','weekly'].includes(input.kind)||typeof input.date!=='string'))throw Error('请选择报表类型和历史日期');
  const id=hash(Date.now()+':'+Math.random());this.jobs.set(id,{status:'queued'});
  this.queue=this.queue.then(async()=>{if(this.stopped){this.jobs.set(id,{status:'failed',error:'插件已停止'});return;}this.jobs.set(id,{status:'running'});try{const c=configuration(await this.server.getConfig());const result=await this.action(input,c);this.jobs.set(id,{status:'completed',result});}catch(e){this.fail(e);this.jobs.set(id,{status:'failed',error:this.lastError});}});
  return {id};
 }
 async action(input:any,c:Config){
  const now=Date.now();
  if(input.action==='test'){
   await this.server.call('admin:sendNotification',{event:{event:'Test',clients:[],time:new Date(now).toISOString(),message:'Komari 日报周报插件测试：RPC 返回不代表 Telegram 已送达。',emoji:''}});return {acceptedByKomari:true};
  }
  if(input.action==='retry'){
   if(this.dispatch.active.has(input.id))throw Error('该记录正在发送中');
   const r=this.storage.records().find(r=>r.id===input.id);if(!r)throw Error('发送记录不存在');
   if(r.parts.some(p=>p.state==='unknown'||p.state==='sending')&&input.confirmDuplicateRisk!==true)throw Error('请先核实未知结果并确认重复发送风险');
   for(const p of r.parts)if(p.state!=='accepted'){p.state='pending';p.nextAt=0;p.attempts=0;}r.status='ready';this.storage.record(r);return this.dispatch.send(r,c,now);
  }
  const p=historicalPeriod(input.date,c.timezone,input.kind);if(p.end>now)throw Error('只能生成完整的历史周期');if(now-p.start>730*86400000)throw Error('历史范围超出 730 天');
  const report=await this.collect(input.kind,p,c,now),parts=paginate(reportLines(report,c),c.messageLength);
  if(input.action==='preview')return {parts,report};
  const record=this.dispatch.prepare(report,c,true);await this.dispatch.send(record,c,now);return record;
 }
 async collect(kind:Kind,p:Period,c:Config,now:number):Promise<Report>{
  const r=await this.collector.collect(kind,p,c,now),key=hash(p.key+scope(c)),totals=this.storage.read<Record<string,{end:number;total:number|null;complete:boolean}>>('totals.json',{});
  const prev=reportPeriod(p.start,c.timezone,kind);
  const match=totals[hash(prev.key+scope(c))];if(match?.complete)r.previousTotal=match.total;
  totals[key]={end:p.end,total:r.total,complete:r.complete};for(const [k,v]of Object.entries(totals))if(now-v.end>c.reportDays*86400000)delete totals[k];this.storage.write('totals.json',totals);return r;
 }
 async tick(){
  if(this.busy||this.stopped)return;this.busy=true;
  try{
   const c=configuration(await this.server.getConfig());this.config=c;const now=Date.now();
   try{await this.collector.observe(c,now);}catch{this.storage.log('在线状态观察失败；该时段将标为未知');this.storage.observe(now,[]);}
   let remaining=2;
   for(const r of this.storage.records().filter(r=>['ready','partial'].includes(r.status))){if(!remaining||this.stopped)break;await this.dispatch.send(r,c,now);remaining--;}
   for(const kind of ['daily','weekly'] as const){if(!(kind==='daily'?c.dailyEnabled:c.weeklyEnabled))continue;
    const time=kind==='daily'?c.dailyTime:c.weeklyTime;
    for(const p of duePeriods(now,c.timezone,time,kind,c.weeklyDay,c.catchupDays)){
     if(!remaining||this.stopped)break;const id=hash(p.key);if(this.storage.read(`reports/${id}.json`,null))continue;
     const report=await this.collect(kind,p,c,now);if(this.stopped)break;const record=this.dispatch.prepare(report,c);await this.dispatch.send(record,c,now);remaining--;
    }
   }
   // Proactively save yesterday even before its intentionally delayed daily send time.
   const day=reportPeriod(now,c.timezone,'daily'),marker='aggregate.json';
   if(!this.stopped&&this.storage.read(marker,'')!==day.key+scope(c)&&now-day.end>600000){await this.collect('daily',day,c,now);this.storage.write(marker,day.key+scope(c));}
   this.storage.clean(now,c.eventDays,c.reportDays);this.lastTick=now;
  }finally{this.busy=false;}
 }
 async unload(){this.stopped=true;await this.task;await this.queue;}
}
