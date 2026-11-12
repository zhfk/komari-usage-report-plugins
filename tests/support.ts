import fs from 'node:fs';import path from 'node:path';
import {Storage} from '../src/storage.ts';import {defaults} from '../src/config.ts';import {historicalPeriod} from '../src/scheduler.ts';
export function temp(){const dir=fs.mkdtempSync(path.join(process.cwd(),'.komari-test-'));return {dir,store:new Storage(fs,dir),close:()=>fs.rmSync(dir,{recursive:true,force:true})};}
export const config={...defaults,catchupDays:0};
export const period=historicalPeriod('2026-11-01','Asia/Shanghai','daily');
export function mockRpc(options:{fail?:string;value?:number;nodes?:number;approximate?:boolean;emptyPing?:boolean}={}){
 const calls:{method:string;params:any}[]=[];
 return {calls,async call(method:string,params:any={}){
  calls.push({method,params});if(options.fail===method)throw Error('fixture failure');
  if(method==='common:getNodes')return Object.fromEntries(Array.from({length:options.nodes??1},(_,i)=>['n'+i,{uuid:'n'+i,name:i?'node'+i:'<香港 & VPS>',created_at:'2026-01-01T00:00:00Z',hidden:false,expired_at:'2027-01-01T00:00:00Z'}]));
  if(method==='common:getNodesLatestStatus')return {'n0':{online:true}};
  if(method==='public:getPingMetricStats')return {stats:options.emptyPing?[]:[{entity_id:params.entity_id,task_id:'1',name:'目标 A',total:10,valid:8,loss:20,loss_approximate:options.approximate||false,avg:30,min:10,max:90}],interval_seconds:60};
  if(method==='public:queryMetrics'){
   const key=params.metric_keys[0],start=Date.parse(params.start),end=Date.parse(params.end);
   if(key==='ping.latency_ms')return {series:[]};
   return {series:[{metric_key:key,entity_id:params.entity_ids[0],type:'gauge',unit:'bytes',interval_seconds:60,downsampled:true,points:Array.from({length:Math.ceil((end-start)/60000)},(_,i)=>({time:new Date(start+i*60000).toISOString(),value:options.value??1,count:1}))}]};
  }
  if(method==='admin:sendNotification')return null;
  throw Error('Unmocked method '+method);
 }};
}
