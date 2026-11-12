export type Kind='daily'|'weekly';
export type Period={start:number;end:number;key:string;startDate:string;endDate:string};
export type Quality='complete'|'estimated'|'unavailable';
export type Metric={value:number|null;quality:Quality;samples:number;coverage:number;note?:string};
export type Ping={id:string;name:string;average:number|null;min:number|null;max:number|null;success:number;failure:number|null;loss:number|null;above:number|null;approximate:boolean;note:string};
export type Interval={uuid:string;start:number;end:number;state:'online'|'offline'|'unknown'};
export type Event={id:string;originalType:string;type:string;time:number;received:number;uuid:string;name:string;message:string;source:string;fingerprint:string;recoveryId?:string};
export type NodeReport={uuid:string;name:string;created:number;expired:number|null;upload:Metric;download:Metric;ping:Ping[];uptime:{online:number;offline:number;unknown:number;rate:number|null;longest:number;count:number};notes:string[]};
export type Report={kind:Kind;period:Period;scope:string;generated:number;nodes:NodeReport[];events:Event[];notes:string[];previousTotal:number|null;total:number|null;complete:boolean};
export type Part={text:string;state:'pending'|'sending'|'accepted'|'failed'|'unknown';attempts:number;nextAt:number;error?:string};
export type RecordEntry={id:string;kind:Kind;period:Period;generated:number;scope:string;status:'ready'|'partial'|'accepted'|'unknown'|'failed';parts:Part[];complete:boolean;error?:string;finished?:number;manual:boolean};
export interface RPC {call(method:string,params?:unknown):Promise<any>}
export function finite(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v);}
export function unavailable(note:string):Metric{return {value:null,quality:'unavailable',coverage:0,samples:0,note};}
/** Never persist raw client/event objects: these may contain agent tokens and addresses. */
export function safeText(v:unknown,max=2000):string {
 let t=typeof v==='string'?v:typeof v==='number'?String(v):'[结构化内容已省略]';
 t=t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\b\d{7,}:[A-Za-z0-9_-]{20,}\b/g,'[凭据已隐藏]').replace(/\b(?:token|api[_ -]?key|authorization|secret)\s*[:=]\s*\S+/gi,'[凭据已隐藏]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP已隐藏]').replace(/\b(?:[a-f\d]{0,4}:){2,}[a-f\d:]+\b/gi,'[IP已隐藏]');
 return t.slice(0,max);
}
