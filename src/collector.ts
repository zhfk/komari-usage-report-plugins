import type {Config} from './config.ts';
import {scope} from './config.ts';
import {finite,unavailable,safeText,type Metric,type NodeReport,type Ping,type Report,type Period,type Kind,type RPC} from './domain.ts';
import {Storage} from './storage.ts';
import {hash} from './events.ts';
import {historicalPeriod} from './scheduler.ts';
import {uptime} from './statistics.ts';

export class Collector {
 rpc:RPC; storage:Storage;
 constructor(rpc:RPC,storage:Storage){this.rpc=rpc;this.storage=storage;}
 async nodes(c:Config):Promise<any[]> {
  const result=await this.rpc.call('common:getNodes');if(!result||typeof result!=='object')throw Error('节点接口返回格式异常');
  const ids=c.nodeIds.split(/[\s,;]+/).filter(Boolean),seen=new Set<string>();
  return Object.values(result).filter((n:any)=>{if(!n||typeof n.uuid!=='string'||seen.has(n.uuid)||(!c.includeHidden&&n.hidden)||(ids.length&&!ids.includes(n.uuid)))return false;seen.add(n.uuid);return true;});
 }
 async observe(c:Config,now:number){
  const nodes=await this.nodes(c),status=await this.rpc.call('common:getNodesLatestStatus',{uuids:nodes.map(n=>n.uuid)});
  this.storage.observe(now,nodes.map(n=>({uuid:n.uuid,state:typeof status?.[n.uuid]?.online==='boolean'?(status[n.uuid].online?'online' as const:'offline' as const):'unknown' as const})));
 }
 async metric(uuid:string,name:string,start:number,end:number,aggregation:string):Promise<any>{
  const v=await this.rpc.call('public:queryMetrics',{metric_keys:[name],entity_ids:[uuid],start:new Date(start).toISOString(),end:new Date(end).toISOString(),aggregation,max_points:1600,fill_empty:false});
  if(!v||!Array.isArray(v.series))throw Error('指标接口返回格式异常');
  const series=v.series.filter((s:any)=>s.metric_key===name&&s.entity_id===uuid&&(!s.tags||Object.keys(s.tags).length===0));
  if(series.length!==1)throw Error('指标缺失或包含歧义序列');return series[0];
 }
 async traffic(uuid:string,key:string,p:Period):Promise<Metric>{
  try{const s=await this.metric(uuid,key,p.start,p.end,'sum');
   if(s.unit!=='bytes'||s.type!=='gauge')return unavailable('流量增量指标类型或单位不符合预期');
   const points=Array.isArray(s.points)?s.points:[],seen=new Set<number>();let value=0,samples=0,min=Infinity,max=-Infinity,invalid=false;
   const width=finite(s.interval_seconds)&&s.interval_seconds>0?s.interval_seconds*1000:60000;
   for(const x of points){const t=Date.parse(x.time);if(t<p.start||t>=p.end)continue;if(!Number.isFinite(t)||!finite(x.value)||x.value<0||seen.has(t)){invalid=true;continue;}seen.add(t);value+=x.value;samples+=finite(x.count)?x.count:1;min=Math.min(min,t);max=Math.max(max,t);}
   if(!seen.size)return unavailable('周期内没有流量样本');
   const ordered=[...seen].sort((a,b)=>a-b);for(let i=1;i<ordered.length;i++)if(ordered[i]-ordered[i-1]>width*2)invalid=true;
   const coverage=Math.min(1,(max-min+width)/(p.end-p.start));
   const aligned=!s.downsampled||(p.start%width===0&&p.end%width===0);
   return {value,quality:!invalid&&coverage>=.99&&aligned?'complete':'estimated',samples,coverage,note:'使用 traffic 增量指标按桶求和；覆盖率是首尾时间跨度，无法证明中间无采集缺口。缺失、重启或清理可能导致少计。'};
  }catch{return unavailable('流量查询失败或指标不可用');}
 }
 async ping(uuid:string,p:Period,c:Config):Promise<Ping[]>{
  try{const v=await this.rpc.call('public:getPingMetricStats',{entity_id:uuid,start:new Date(p.start).toISOString(),end:new Date(p.end).toISOString(),max_points:1600});
   if(!Array.isArray(v?.stats))throw Error('Ping 格式异常');
   const tasks=v.stats.filter((s:any)=>s.entity_id===uuid);
   const result:Ping[]=tasks.map((s:any)=>{const total=finite(s.total)?s.total:0,valid=finite(s.valid)?s.valid:0,reliable=total>0&&!s.loss_approximate&&finite(s.loss)&&s.loss>=0&&s.loss<=100;
    return {id:String(s.task_id),name:safeText(s.name||`任务 ${s.task_id}`,200),average:finite(s.avg)&&s.avg>=0?s.avg:null,min:finite(s.min)&&s.min>=0?s.min:null,max:finite(s.max)&&s.max>=0?s.max:null,success:valid,failure:reliable?Math.max(0,total-valid):null,loss:reliable?s.loss:null,above:null,approximate:true,note:'官方历史聚合统计；超阈值原始次数不可恢复，探测间断不等于失败。'};
   });
   try{const raw=await this.rpc.call('public:queryMetrics',{metric_keys:['ping.latency_ms'],entity_ids:[uuid],start:new Date(p.start).toISOString(),end:new Date(p.end).toISOString(),max_points:1600,aggregation:'max',fill_empty:false});
    for(const task of result){const series=raw?.series?.filter((s:any)=>s.entity_id===uuid&&String(s.tags?.task_id)===task.id);if(series?.length===1&&!series[0].downsampled){const values=series[0].points.filter((x:any)=>Date.parse(x.time)>=p.start&&Date.parse(x.time)<p.end&&finite(x.value)&&x.value>=0);task.above=values.filter((x:any)=>x.value>c.pingSingleMs).length;}}
   }catch{}
   return result;
  }catch{return [];}
 }
 async day(node:any,p:Period,c:Config,now:number):Promise<NodeReport>{
  const cache=`daily/${p.startDate}-${hash(JSON.stringify([scope(c),node.uuid,c.traffic,c.ping,c.pingSingleMs])).slice(0,20)}.json`;
  const saved=this.storage.read<{generated:number;node:NodeReport}|null>(cache,null);
  if(saved && now-saved.generated<3600000)return saved.node;
  const created=Date.parse(node.created_at),start=Math.max(p.start,Number.isFinite(created)?created:p.start);
  const effective={...p,start};
  const upload=c.traffic?await this.traffic(node.uuid,'traffic.up',effective):unavailable('已关闭'),download=c.traffic?await this.traffic(node.uuid,'traffic.down',effective):unavailable('已关闭');
  const ping=c.ping?await this.ping(node.uuid,effective,c):[];
  const intervals=this.storage.intervals(start,p.end).filter(x=>x.uuid===node.uuid);
  const u= start<p.end?uptime(intervals,start,p.end):{online:0,offline:0,unknown:0,rate:null};
  let longest=0,run=0,count=0,lastEnd=-1;
  for(const x of intervals.sort((a,b)=>a.start-b.start)){if(x.state==='offline'){const a=Math.max(start,x.start),b=Math.min(p.end,x.end);if(a!==lastEnd){count++;run=0;}run+=b-a;longest=Math.max(longest,run);lastEnd=b;}else{run=0;lastEnd=-1;}}
  const n:NodeReport={uuid:node.uuid,name:safeText(node.name||node.uuid,200),created:Number.isFinite(created)?created:p.start,expired:Number.isFinite(Date.parse(node.expired_at))?Date.parse(node.expired_at):null,upload,download,ping,uptime:{online:u.online,offline:u.offline,unknown:u.unknown,rate:u.rate,longest,count},notes:['在线率及离线时长为每分钟观察估算；插件停机或观察间断计为未知。']};
  this.storage.write(cache,{generated:now,node:n});return n;
 }
 async collect(kind:Kind,p:Period,c:Config,now=Date.now()):Promise<Report>{
  const report:Report={kind,period:p,scope:scope(c),generated:now,nodes:[],events:[],notes:[],previousTotal:null,total:null,complete:false};
  try{
   const nodes=(await this.nodes(c)).filter(n=>!Number.isFinite(Date.parse(n.created_at))||Date.parse(n.created_at)<p.end);if(!nodes.length)report.notes.push('没有符合配置的节点');
   // Process one node/day at a time; weekly results reuse daily aggregates.
   for(const node of nodes){const days:NodeReport[]=[];let date=p.startDate;
    for(let i=0;i<(kind==='daily'?1:7);i++){const day=historicalPeriod(date,c.timezone,'daily');if(day.start>=p.end)break;days.push(await this.day(node,day,c,now));date=day.endDate;}
    const first=days[0];if(!first)continue;const n:NodeReport=JSON.parse(JSON.stringify(first));
    if(days.length>1){
     for(const key of ['upload','download'] as const){const ms=days.map(d=>d[key]);n[key]={value:ms.every(x=>x.value!==null)?ms.reduce((a,b)=>a+b.value!,0):null,quality:ms.every(x=>x.quality==='complete')?'complete':'estimated',samples:ms.reduce((a,b)=>a+b.samples,0),coverage:ms.reduce((a,b)=>a+b.coverage,0)/days.length,note:'按日聚合汇总'};}
     n.uptime={online:0,offline:0,unknown:0,rate:null,longest:0,count:0};for(const d of days){n.uptime.online+=d.uptime.online;n.uptime.offline+=d.uptime.offline;n.uptime.unknown+=d.uptime.unknown;n.uptime.longest=Math.max(n.uptime.longest,d.uptime.longest);n.uptime.count+=d.uptime.count;}n.uptime.rate=n.uptime.online+n.uptime.offline?n.uptime.online/(n.uptime.online+n.uptime.offline):null;
     const spans=this.storage.intervals(p.start,p.end).filter(x=>x.uuid===n.uuid).sort((a,b)=>a.start-b.start);let run=0,lastEnd=-1;n.uptime.count=0;n.uptime.longest=0;for(const x of spans){if(x.state==='offline'){const a=Math.max(p.start,x.start),b=Math.min(p.end,x.end);if(a!==lastEnd){n.uptime.count++;run=0;}run+=b-a;n.uptime.longest=Math.max(n.uptime.longest,run);lastEnd=b;}else{run=0;lastEnd=-1;}}
     // Query the full week for task-specific statistics instead of averaging daily means.
     if(c.ping)n.ping=await this.ping(n.uuid,p,c);
    }
    report.nodes.push(n);
   }
   const ids=new Set(report.nodes.map(n=>n.uuid));report.events=this.storage.events(p.start,p.end).filter(e=>!e.uuid||ids.has(e.uuid));
   if(!c.eventForwarding)report.notes.push('未启用原生事件转发，离线/告警/到期/续费事件历史不可确认');
   else report.notes.push('事件仅包含成功转发且留存的记录；插件停机期间可能有缺口，续费结果未经确认');
   report.complete=report.nodes.length>0&&report.nodes.every(n=>(!c.traffic||n.upload.quality==='complete'&&n.download.quality==='complete')&&(!c.uptime||n.uptime.unknown===0)&&(!c.ping||n.ping.length>0&&n.ping.every(p=>p.success>0||p.failure!==null&&p.failure>0)))&&c.eventForwarding;
   const values=report.nodes.map(n=>n.upload.value!==null&&n.download.value!==null?n.upload.value+n.download.value:null);report.total=values.length&&values.every(v=>v!==null)?values.reduce<number>((a,b)=>a+b!,0):null;
  }catch{report.notes.push('统计失败：节点信息或历史数据不可用');}
  return report;
 }
}
