import type {Config} from './config.ts';
import type {RecordEntry,RPC,Report} from './domain.ts';
import {Storage} from './storage.ts';import {hash} from './events.ts';import {paginate,reportLines} from './format-report.ts';
export class Dispatch {
 rpc:RPC;storage:Storage;active=new Set<string>();
 constructor(rpc:RPC,storage:Storage){this.rpc=rpc;this.storage=storage;}
 prepare(report:Report,c:Config,manual=false):RecordEntry {
  const id=hash(report.period.key+(manual?':manual:'+report.generated:''));const prior=this.storage.read<RecordEntry|null>(`reports/${id}.json`,null);if(prior)return prior;
  const r:RecordEntry={id,kind:report.kind,period:report.period,scope:report.scope,generated:report.generated,status:'ready',parts:paginate(reportLines(report,c),c.messageLength).map(text=>({text,state:'pending',attempts:0,nextAt:0})),complete:report.complete,manual};this.storage.record(r);return r;
 }
 async send(r:RecordEntry,c:Config,now=Date.now()):Promise<RecordEntry>{
  if(this.active.has(r.id))return r;this.active.add(r.id);
  try{
   // Reload the committed state. A prior 'sending' can mean a process crash after external acceptance.
   r=this.storage.read(`reports/${r.id}.json`,r);
   for(const p of r.parts){if(p.state==='sending'){p.state='unknown';p.error='上次发送中断，需人工核实';r.status='unknown';this.storage.record(r);} }
   if(r.parts.some(p=>p.state==='unknown'))return r;
   for(const p of r.parts){if(p.state==='accepted')continue;if(p.nextAt>now||p.attempts>c.retries)return r;
    p.state='sending';p.attempts++;this.storage.record(r);
    try{await this.rpc.call('admin:sendNotification',{event:{event:r.kind==='daily'?'DailyReport':'WeeklyReport',clients:[],time:new Date(now).toISOString(),message:p.text,emoji:''}});p.state='accepted';}
    catch(e:any){
     // Only errors known to occur before provider invocation are safe to retry.
     const safe=[-32601,-32602,-32040,-32041].includes(e?.code);
     p.state=safe?'failed':'unknown';p.error=safe?'通知 RPC 拒绝请求':'通知结果无法确认，请先检查通知渠道';p.nextAt=now+c.retrySeconds*1000*Math.pow(2,Math.min(8,p.attempts-1));r.error=p.error;
    }
    r.status=p.state==='unknown'?'unknown':p.state==='failed'?(p.attempts>c.retries?'failed':'partial'):'partial';this.storage.record(r);if(p.state!=='accepted')return r;
   }
   r.status='accepted';r.finished=now;delete r.error;this.storage.record(r);return r;
  }finally{this.active.delete(r.id);}
 }
}
