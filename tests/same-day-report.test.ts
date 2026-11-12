import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {App,type Server} from '../src/app.ts';
import {Collector} from '../src/collector.ts';
import {reportLines} from '../src/format-report.ts';
import {normalizeEvents} from '../src/events.ts';
import {duePeriods,historicalPeriod,reportPeriod} from '../src/scheduler.ts';
import {config,mockRpc,temp} from './support.ts';

const now=Date.parse('2026-11-12T15:59:00Z');
const zone='Asia/Shanghai';

test('current daily report takes priority over complete historical catchup days',()=>{
 const periods=duePeriods(now,zone,'23:59','daily',1,3);
 assert.equal(periods.length,4);
 assert.equal(periods[0].startDate,'2026-11-12');
 assert.equal(periods[0].end,now);
 for(const date of ['2026-11-09','2026-11-10','2026-11-11']){
  assert.deepEqual(periods.find(p=>p.startDate===date),historicalPeriod(date,zone,'daily'));
 }
});

test('daily schedule waits until due and catches up yesterday after midnight',()=>{
 assert.deepEqual(duePeriods(now-60000,zone,'23:59','daily',1,0),[]);
 const periods=duePeriods(Date.parse('2026-11-12T16:00:00Z'),zone,'23:59','daily',1,1);
 assert.deepEqual(periods,[historicalPeriod('2026-11-12',zone,'daily')]);
});

test('same-day cutoff respects UTC, year boundaries and daylight saving time',()=>{
 for(const [stamp,tz,date,start] of [
  ['2026-11-12T23:59:00Z','UTC','2026-11-12','2026-11-12T00:00:00.000Z'],
  ['2026-12-31T15:59:00Z',zone,'2026-12-31','2026-12-30T16:00:00.000Z'],
  ['2026-03-09T03:59:00Z','America/New_York','2026-03-08','2026-03-08T05:00:00.000Z'],
  ['2026-11-02T04:59:00Z','America/New_York','2026-11-01','2026-11-01T04:00:00.000Z']
 ]){
  const p=reportPeriod(Date.parse(stamp),tz,'daily');
  assert.equal(p.startDate,date);
  assert.equal(new Date(p.start).toISOString(),start);
  assert.equal(p.end,Date.parse(stamp));
 }
});

test('live daily metrics stop at the cutoff and cannot poison completed-day aggregates',async()=>{
 const t=temp();
 try{
  const rpc=mockRpc(),collector=new Collector(rpc,t.store),day=historicalPeriod('2026-11-12',zone,'daily');
  const live={...day,end:now,endDate:'2026-11-12'};
  for(const [time,message] of [[day.start-1,'yesterday'],[day.start,'today'],[now-1,'before cutoff'],[now,'at cutoff']] as const){
   for(const event of normalizeEvents({event:'Alert',time:new Date(time).toISOString(),clients:[{uuid:'n0',name:'node'}],message},now))t.store.event(event);
  }
  const report=await collector.collect('daily',live,config,now);
  const calls=rpc.calls.filter(x=>x.method==='public:queryMetrics'||x.method==='public:getPingMetricStats');
  assert.ok(calls.length>0);
  assert.ok(calls.every(x=>Date.parse(x.params.start)===day.start&&Date.parse(x.params.end)===now));
  assert.equal(report.nodes[0].upload.value,1439);
  assert.deepEqual(report.events.map(e=>e.message),['today','before cutoff']);
  assert.equal(t.store.files('daily').length,0);
  assert.match(reportLines(report,config).join('\n'),/2026-11-12 00:00 至 2026-11-12 23:59/);
  const complete=await collector.collect('daily',day,config,day.end+1000);
  assert.equal(complete.nodes[0].upload.value,1440);
  assert.equal(t.store.files('daily').length,1);
 }finally{t.close();}
});

test('actual app sends today at 23:59 and keeps a stable daily key across later ticks',async t=>{
 let clock=now;t.mock.method(Date,'now',()=>clock);
 const fixture=temp(),rpc=mockRpc();
 const server:Server={call:rpc.call,getConfig:async()=>({...config,dailyTime:'23:59',catchupDays:3,weeklyEnabled:false}),cron(){},route(){}};
 const app=new App(server,fs,fixture.dir);
 try{
  await app.load();await app.task;
  const current=fixture.store.records().find(r=>r.period.key==='daily:Asia/Shanghai:2026-11-12');
  assert.ok(current);
  assert.equal(current.period.start,Date.parse('2026-11-11T16:00:00Z'));
  assert.equal(current.period.end,now);
  assert.equal(current.status,'accepted');
  assert.match(current.parts.map(p=>p.text).join(''),/2026-11-12 00:00 至 2026-11-12 23:59/);
  clock+=30000;await app.tick();
  assert.equal(fixture.store.records().filter(r=>r.period.key===current.period.key).length,1);
  assert.equal(fixture.store.records().find(r=>r.id===current.id)!.generated,now);
 }finally{await app.unload();fixture.close();}
});
