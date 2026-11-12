import {safeText,type Event,type Interval,type RecordEntry,type NodeReport} from './domain.ts';
export interface Disk {
 existsSync(p:string):boolean;mkdirSync(p:string,o:{recursive:boolean}):unknown;
 readFileSync(p:string,e:'utf8'):string;writeFileSync(p:string,s:string,e:'utf8'):unknown;
 renameSync(a:string,b:string):unknown;readdirSync(p:string):string[];unlinkSync(p:string):unknown;
}
export class Storage {
 fs:Disk; root:string;
 constructor(fs:Disk,root:string){this.fs=fs;this.root=root;for(const d of ['events','intervals','reports','daily'])fs.mkdirSync(`${root}/${d}`,{recursive:true});this.migrate();}
 read<T>(name:string,fallback:T):T{const p=this.path(name);if(!this.fs.existsSync(p))return fallback;try{return JSON.parse(this.fs.readFileSync(p,'utf8')) as T;}catch{throw Error(`存储损坏：${name}，请先备份后恢复`);}}
 write(name:string,data:unknown){const p=this.path(name),text=JSON.stringify(data);if(text.length>4_000_000)throw Error('存储单文件上限 4 MB');this.fs.writeFileSync(p+'.tmp',text,'utf8');this.fs.renameSync(p+'.tmp',p);}
 path(name:string){if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.includes('..')||name.startsWith('/'))throw Error('非法存储路径');return `${this.root}/${name}`;}
 migrate(){const meta=this.read('meta.json',{version:1,created:Date.now()});if(meta.version!==1)throw Error('不支持的数据版本，请使用兼容插件恢复');this.write('meta.json',meta);}
 files(dir:string){return this.fs.readdirSync(this.path(dir)).filter(n=>n.endsWith('.json')).sort();}
 records():RecordEntry[]{return this.files('reports').map(n=>this.read<RecordEntry>(`reports/${n}`,null as any));}
 record(r:RecordEntry){this.write(`reports/${r.id}.json`,r);}
 event(e:Event):boolean {const day=new Date(e.time).toISOString().slice(0,10),p=`events/${day}.json`,events=this.read<Event[]>(p,[]);if(events.some(x=>x.fingerprint===e.fingerprint))return false;if(events.length>=10000)throw Error('单日事件数量上限');events.push(e);events.sort((a,b)=>a.time-b.time);this.write(p,events);return true;}
 events(start:number,end:number):Event[]{return this.range<Event>('events',start,end).filter(x=>x.time>=start&&x.time<end).sort((a,b)=>a.time-b.time);}
 range<T>(dir:string,start:number,end:number):T[]{const a=new Date(start).toISOString().slice(0,10),b=new Date(end).toISOString().slice(0,10);return this.files(dir).filter(n=>n.slice(0,10)>=a&&n.slice(0,10)<=b).flatMap(n=>this.read<T[]>(`${dir}/${n}`,[]));}
 intervals(start:number,end:number):Interval[]{return this.range<Interval>('intervals',start-86400000,end).filter(x=>x.end>start&&x.start<end);}
 observe(now:number,states:{uuid:string;state:Interval['state']}[]) {
  const prev=this.read<{time:number;states:typeof states}>('observations.json',{time:now,states:[]});
  if(now>prev.time&&now-prev.time<=150000){
   for(const s of prev.states){let start=prev.time;while(start<now){const day=new Date(start).toISOString().slice(0,10),end=Math.min(now,Date.parse(day+'T00:00:00Z')+86400000),file=`intervals/${day}.json`,rows=this.read<Interval[]>(file,[]),last=[...rows].reverse().find(x=>x.uuid===s.uuid);
    if(last&&last.end===start&&last.state===s.state)last.end=end;else rows.push({...s,start,end});this.write(file,rows);start=end;
   }}
  }
  this.write('observations.json',{time:now,states});
 }
 log(message:string){const rows=this.read<{time:number;message:string}[]>('logs.json',[]);rows.push({time:Date.now(),message:safeText(message)});this.write('logs.json',rows.slice(-200));}
 clean(now:number,eventDays:number,reportDays:number){for(const dir of ['events','intervals','daily'])for(const n of this.files(dir)){const t=Date.parse(n.slice(0,10));if(Number.isFinite(t)&&now-t>(dir==='daily'?reportDays:eventDays)*86400000)this.fs.unlinkSync(this.path(`${dir}/${n}`));}for(const r of this.records())if(now-r.generated>reportDays*86400000)this.fs.unlinkSync(this.path(`reports/${r.id}.json`));}
 streamBackup(res:any){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="komari-reports-backup.json"');res.setHeader('Cache-Control','no-store');res.streaming=true;
  res.write('{"version":1,"files":[');let first=true;
  for(const dir of ['events','intervals','reports','daily'])for(const file of this.files(dir)){if(!first)res.write(',');first=false;res.write(JSON.stringify({path:dir+'/'+file,data:this.read(dir+'/'+file,null)}));}
  res.end(']}');
 }
 backup(){return {version:1,meta:this.read('meta.json',{}),events:this.files('events').map(n=>({file:n,data:this.read(`events/${n}`,[])})),intervals:this.files('intervals').map(n=>({file:n,data:this.read(`intervals/${n}`,[])})),reports:this.records(),daily:this.files('daily').map(n=>({file:n,data:this.read(`daily/${n}`,{})}))};}
}
