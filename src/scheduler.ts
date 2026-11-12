/** Calendar scheduling independent of the server's timezone. */
type LocalDate = {year:number;month:number;day:number};
const formatters=new Map<string,Intl.DateTimeFormat>();
function parts(time:number, zone:string) {
 if(!Number.isFinite(time))throw Error('Invalid time');
 if(zone==='Asia/Shanghai'||zone==='UTC'||zone==='Etc/UTC'){
  const d=new Date(time+(zone==='Asia/Shanghai'?28800000:0));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes()};
 }
 if(typeof Intl==='undefined'||typeof Intl.DateTimeFormat!=='function')throw Error('当前运行时缺少 IANA 时区支持，请使用 Asia/Shanghai 或 UTC');
 let f=formatters.get(zone);if(!f){f=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,f);}
 const p:Record<string,number>={};for(const x of f.formatToParts(new Date(time)))if(x.type!=='literal')p[x.type]=Number(x.value);return p;
}
export function localDateTime(time:number,zone:string){const p=parts(time,zone);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')} ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;}
function shift(d:LocalDate, days:number):LocalDate {const x=new Date(Date.UTC(d.year,d.month-1,d.day+days));return {year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()};}
function key(d:LocalDate) {return `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;}
/** Convert a local midnight to UTC using zone offsets; validate nonexistent midnight. */
function midnight(d:LocalDate,zone:string):number {
 const target=Date.UTC(d.year,d.month-1,d.day);
 // First instant of this local date. Handles repeated or missing midnight during DST.
 let lo=target-36*3600000,hi=target+36*3600000;
 const dateNumber=(n:number)=>{const p=parts(n,zone);return Date.UTC(p.year,p.month-1,p.day);};
 while(hi-lo>60000){const mid=Math.floor((lo+hi)/120000)*60000;if(dateNumber(mid)<target)lo=mid;else hi=mid;}
 if(dateNumber(hi)!==target)throw Error('Local date does not exist in timezone');return hi;
}
export function reportPeriod(now:number,zone:string,type:'daily'|'weekly') {
 const p=parts(now,zone);const today={year:p.year,month:p.month,day:p.day};
 const weekday=new Date(Date.UTC(today.year,today.month-1,today.day)).getUTCDay();
 const end=type==='daily'?today:shift(today,-((weekday+6)%7));
 const start=shift(end,type==='daily'?-1:-7);
 return {start:midnight(start,zone),end:midnight(end,zone),key:`${type}:${zone}:${key(start)}`,startDate:key(start),endDate:key(end)};
}
export function due(now:number,zone:string,time:string,type:'daily'|'weekly',weekDay=1) {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isInteger(weekDay)||weekDay<0||weekDay>6) throw new Error('Invalid schedule');
 const p=parts(now,zone); const weekday=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
 const [hour,minute]=time.split(':').map(Number);
 return (type==='daily'||weekday===weekDay) && p.hour*60+p.minute>=hour*60+minute;
}
/** Explicit complete historical day/week selected in the configured timezone. */
export function historicalPeriod(date:string,zone:string,type:'daily'|'weekly') {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('日期必须为 YYYY-MM-DD');
 const [year,month,day]=date.split('-').map(Number),d={year,month,day};
 if(key(shift(d,0))!==date||year<2000)throw Error('日期无效');
 const wd=new Date(Date.UTC(year,month-1,day)).getUTCDay();
 const start=type==='daily'?d:shift(d,-((wd+6)%7)),end=shift(start,type==='daily'?1:7);
 return {start:midnight(start,zone),end:midnight(end,zone),startDate:key(start),endDate:key(end),key:`${type}:${zone}:${key(start)}`};
}
export function duePeriods(now:number,zone:string,time:string,type:'daily'|'weekly',weekDay:number,catchupDays:number) {
 const out:ReturnType<typeof reportPeriod>[]=[];const seen=new Set<string>();
 for(let i=catchupDays;i>=0;i--){
  // Noon-based calendar shifting avoids the DST 23/25-hour-day duplicate problem.
  const p=parts(now,zone),d=shift({year:p.year,month:p.month,day:p.day},-i);
  const at= i===0?now:midnight(d,zone)+12*3600000;
  const local=parts(at,zone),weekday=new Date(Date.UTC(local.year,local.month-1,local.day)).getUTCDay();
  if(i===0?!due(at,zone,time,type,weekDay):type==='weekly'&&weekday!==weekDay)continue;
  const period=reportPeriod(at,zone,type);if(!seen.has(period.key)){out.push(period);seen.add(period.key);}
 }
 return out;
}
