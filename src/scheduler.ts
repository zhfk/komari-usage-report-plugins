/** Calendar scheduling independent of the server's timezone. */
type LocalDate = {year:number;month:number;day:number};
function parts(time:number, zone:string) {
  const f=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p:Record<string,number>={}; for(const x of f.formatToParts(new Date(time))) if(x.type!=='literal') p[x.type]=Number(x.value);
  return p;
}
function shift(d:LocalDate, days:number):LocalDate {const x=new Date(Date.UTC(d.year,d.month-1,d.day+days));return {year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()};}
function key(d:LocalDate) {return `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;}
/** Convert a local midnight to UTC using zone offsets; validate nonexistent midnight. */
function midnight(d:LocalDate,zone:string):number {
 const target=Date.UTC(d.year,d.month-1,d.day); let guess=target;
 for(let i=0;i<5;i++) {const p=parts(guess,zone); const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);const next=guess+target-local;if(next===guess)break;guess=next;}
 const p=parts(guess,zone);if(p.year!==d.year||p.month!==d.month||p.day!==d.day||p.hour!==0||p.minute!==0) throw new Error('Local midnight does not exist in timezone');
 return guess;
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
