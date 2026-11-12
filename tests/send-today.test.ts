import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {App,BASE,type Server} from '../src/app.ts';
import {config,mockRpc,temp} from './support.ts';

function setup(extra={}){
 const fixture=temp(),rpc=mockRpc(),routes=new Map<string,(req:any,res:any)=>unknown>();
 const settings={...config,dailyEnabled:false,weeklyEnabled:false,...extra};
 const server:Server={call:rpc.call,getConfig:async()=>settings,cron(){},route(method,path,handler){routes.set(method+' '+path,handler);}};
 return {fixture,rpc,routes,settings,app:new App(server,fs,fixture.dir)};
}
function response(){return {statusCode:200,body:'',setHeader(){},end(body:string){this.body=body;}};}

test('send today action uses the configured local day and current cutoff without historical inputs',async t=>{
 const now=Date.parse('2026-11-12T03:10:42Z');t.mock.method(Date,'now',()=>now);
 const s=setup({timezone:'America/New_York'});
 try{
  await s.app.load();await s.app.task;s.rpc.calls.length=0;
  const res=response();
  s.routes.get('POST '+BASE+'/action')!({method:'POST',context:{principal:{roles:['admin']}},headers:{origin:'https://komari.test','sec-fetch-site':'same-origin','x-komari-reports-csrf':s.app.csrfToken},body:JSON.stringify({action:'sendToday',kind:'weekly',date:'2099-01-01'})},res);
  assert.equal(res.statusCode,200);
  const {id}=JSON.parse(res.body);await s.app.queue;
  const job=s.app.jobs.get(id)!;assert.equal(job.status,'completed');
  const record=s.fixture.store.records()[0];
  assert.equal(record.kind,'daily');assert.equal(record.manual,true);assert.equal(record.status,'accepted');
  assert.equal(record.period.startDate,'2026-11-11');
  assert.equal(record.period.start,Date.parse('2026-11-11T05:00:00Z'));
  assert.equal(record.period.end,now);
  const metrics=s.rpc.calls.filter(x=>['public:queryMetrics','public:getPingMetricStats'].includes(x.method));
  assert.ok(metrics.length>0);
  assert.ok(metrics.every(x=>Date.parse(x.params.start)===record.period.start&&Date.parse(x.params.end)===now));
  const notifications=s.rpc.calls.filter(x=>x.method==='admin:sendNotification');
  assert.ok(notifications.length>0);assert.ok(notifications.every(x=>x.params.event.event==='DailyReport'));
  assert.match(notifications.map(x=>x.params.event.message).join(''),/2026-11-11 00:00 至 2026-11-11 22:10/);
 }finally{await s.app.unload();s.fixture.close();}
});

test('repeated send today requests refresh the cutoff and remain independent of automatic delivery',async t=>{
 let now=Date.parse('2026-11-12T07:12:00Z');t.mock.method(Date,'now',()=>now);
 const s=setup();
 async function send(){const {id}=s.app.enqueue({action:'sendToday'});await s.app.queue;assert.equal(s.app.jobs.get(id)!.status,'completed');}
 try{
  await s.app.load();await s.app.task;
  await send();now+=60000;await send();
  let records=s.fixture.store.records();
  assert.equal(records.length,2);assert.ok(records.every(r=>r.manual&&r.kind==='daily'));
  assert.deepEqual(records.map(r=>r.period.end).sort(),[now-60000,now]);
  assert.equal(s.fixture.store.files('daily').filter(name=>name.startsWith('2026-11-12')).length,0);
  s.settings.dailyEnabled=true;s.settings.dailyTime='00:00';await s.app.tick();
  records=s.fixture.store.records();assert.equal(records.filter(r=>!r.manual).length,1);
  now+=60000;await send();
  records=s.fixture.store.records();assert.equal(records.filter(r=>r.manual).length,3);
  assert.equal(records.filter(r=>!r.manual).length,1);
 }finally{await s.app.unload();s.fixture.close();}
});

test('send today action requires an administrator and rejects cross-site requests',async()=>{
 const s=setup();
 try{
  await s.app.load();await s.app.task;s.rpc.calls.length=0;
  const handler=s.routes.get('POST '+BASE+'/action')!;
  for(const [roles,origin] of [[[],'https://komari.test'],[['admin'],'https://other.test']] as const){
   const res=response();handler({method:'POST',context:{principal:{roles}},headers:{host:'komari.test',origin},body:'{"action":"sendToday"}'},res);
   assert.equal(res.statusCode,403);
  }
  assert.equal(s.app.jobs.size,0);
  assert.equal(s.rpc.calls.filter(x=>x.method==='admin:sendNotification').length,0);
 }finally{await s.app.unload();s.fixture.close();}
});
