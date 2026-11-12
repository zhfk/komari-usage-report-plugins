export const defaults = {
 dailyEnabled:true, dailyTime:'23:59', weeklyEnabled:true, weeklyTime:'09:00', weeklyDay:1,
 timezone:'Asia/Shanghai', nodeIds:'', includeHidden:false,
 traffic:true,ping:true,uptime:true,offline:true,cpu:true,memory:true,disk:true,load:true,expiry:true,renewal:true,comparison:true,rankings:true,summary:true,
 eventDays:180,reportDays:180,maxEvents:50,retries:3,retrySeconds:60,catchupDays:3,
 pingAverageMs:200,pingSingleMs:300,pingLossPercent:5,completeness:true,
 sort:'name',messageLength:2800,eventSecret:'',eventForwarding:false
};
export type Config=typeof defaults;
export function configuration(raw:Record<string,unknown>):Config {
 const c={...defaults};
 for(const key of Object.keys(defaults) as (keyof Config)[]){
  const v=raw[key];if(v===undefined)continue;
  if(typeof v!==typeof defaults[key])throw Error(`配置 ${key} 类型错误`);
  (c as unknown as Record<string,unknown>)[key]=v;
 }
 for(const k of ['dailyTime','weeklyTime'] as const)if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(c[k]))throw Error(`配置 ${k} 时间无效`);
 for(const [k,min,max] of [['weeklyDay',0,6],['eventDays',90,730],['reportDays',14,730],['maxEvents',1,500],['retries',0,10],['retrySeconds',10,3600],['catchupDays',0,31],['messageLength',512,3500]] as const){if(!Number.isInteger(c[k])||c[k]<min||c[k]>max)throw Error(`配置 ${k} 超出范围 ${min}–${max}`);}
 for(const k of ['pingAverageMs','pingSingleMs','pingLossPercent'] as const)if(!Number.isFinite(c[k])||c[k]<0)throw Error(`配置 ${k} 无效`);
 if(c.pingLossPercent>100)throw Error('丢包率阈值必须在 0–100');
 if(!['name','traffic','uptime'].includes(c.sort))throw Error('节点排序无效');
 if(c.eventForwarding&&c.eventSecret.length<32)throw Error('启用事件转发需要至少 32 位共享密钥');
 return c;
}
export function scope(c:Config):string {return JSON.stringify([c.nodeIds,c.includeHidden,c.timezone]);}
