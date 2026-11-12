import {createHash} from 'node:crypto';
import {safeText,type Event} from './domain.ts';
export function hash(s:string){return createHash('sha256').update(s).digest('hex');}
export function normalizeEvents(raw:any,now=Date.now()):Event[]{
 if(!raw||typeof raw!=='object')throw Error('事件必须为对象');
 const originalType=safeText(raw.event,80);
 if(['DailyReport','WeeklyReport','ReportFailure'].includes(originalType))return [];
 const time=Date.parse(raw.time);if(!Number.isFinite(time)||time>now+300000||time<now-731*86400000)throw Error('事件时间无效');
 const type=['Offline','Online','Alert','Renew','Expire','Test'].includes(originalType)?originalType:'Unknown';
 const list=Array.isArray(raw.clients)&&raw.clients.length?raw.clients:[{}];if(list.length>1000)throw Error('事件节点数超限');
 return list.map((c:any)=>{const uuid=typeof c.uuid==='string'?c.uuid.slice(0,100):'',name=safeText(c.name||uuid||'全局事件',200),message=safeText(raw.message);const fingerprint=hash(JSON.stringify([originalType,time,uuid,message]));
  return {id:fingerprint,originalType,type,time,received:now,uuid,name,message,source:'notification-forwarder',fingerprint};
 });
}
