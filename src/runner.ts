import {due,reportPeriod} from './scheduler.ts';
import {renderReport,type Snapshot} from './report.ts';
import {Delivery,type DeliveryState} from './delivery.ts';

export type ReportKind='daily'|'weekly';
export type ReportConfig={timezone:string;dailyEnabled:boolean;dailyTime:string;weeklyEnabled:boolean;weeklyTime:string;weeklyDay:number};
export type Period=ReturnType<typeof reportPeriod>;
export interface Collector { collect(kind:ReportKind,period:Period):Promise<Snapshot> }
/** Coordinates collection and delivery; all provider failures yield an honest incomplete report. */
export class Runner {
 private delivery:Delivery;private collector:Collector;
 constructor(delivery:Delivery,collector:Collector){this.delivery=delivery;this.collector=collector;}
 async tick(now:number,config:ReportConfig):Promise<DeliveryState[]> {
  const result:DeliveryState[]=[];
  const jobs:[ReportKind,boolean,string][]=[['daily',config.dailyEnabled,config.dailyTime],['weekly',config.weeklyEnabled,config.weeklyTime]];
  for(const [kind,enabled,time] of jobs){
   if(!enabled||!due(now,config.timezone,time,kind,config.weeklyDay))continue;
   const period=reportPeriod(now,config.timezone,kind);
   let snapshot:Snapshot;
   try{snapshot=await this.collector.collect(kind,period);}catch{
    snapshot={nodeCount:null,upload:null,download:null,pingAverage:null,uptimeRate:null,alerts:[],complete:false,note:'统计失败，监控数据不可用'};
   }
   const text=renderReport(kind,period.startDate,period.endDate,config.timezone,snapshot);
   result.push(await this.delivery.send(period.key,text));
  }
  return result;
 }
}
