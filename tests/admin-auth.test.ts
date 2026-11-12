import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {App,BASE,type Server} from '../src/app.ts';
import {config,mockRpc,temp} from './support.ts';

function setup(){
 const fixture=temp(),rpc=mockRpc(),routes=new Map<string,(req:any,res:any)=>unknown>();
 const server:Server={call:rpc.call,getConfig:async()=>({...config,dailyEnabled:false,weeklyEnabled:false}),cron(){},route(method,path,handler){routes.set(method+' '+path,handler);}};
 return {fixture,rpc,routes,app:new App(server,fs,fixture.dir)};
}
function response(){return {statusCode:200,body:'',setHeader(){},end(body:string){this.body=body;}};}
const context={principal:{roles:['admin']}};

test('same-origin admin actions work without Host and behind a rewritten proxy Host',async()=>{
 const s=setup();
 try{
  await s.app.load();await s.app.task;
  for(const proxy of [false,true]){
   const res=response();
   s.routes.get('POST '+BASE+'/action')!({method:'POST',context,headers:{origin:'https://public.example.com','sec-fetch-site':'same-origin','x-komari-reports-csrf':s.app.csrfToken,...(proxy?{host:'127.0.0.1:25774'}:{})},body:'{"action":"test"}'},res);
   assert.equal(res.statusCode,200);const {id}=JSON.parse(res.body);await s.app.queue;
   assert.equal(s.app.jobs.get(id)!.status,'completed');
  }
 }finally{await s.app.unload();s.fixture.close();}
});

test('admin actions reject missing, invalid and duplicate CSRF headers before enqueueing',async()=>{
 const s=setup();
 try{
  await s.app.load();await s.app.task;
  for(const token of [undefined,'incorrect',[s.app.csrfToken,s.app.csrfToken]]){
   const res=response();s.routes.get('POST '+BASE+'/action')!({method:'POST',context,headers:{'sec-fetch-site':'same-origin',...(token===undefined?{}:{'x-komari-reports-csrf':token})},body:'{"action":"sendToday"}'},res);
   assert.equal(res.statusCode,403);assert.match(res.body,/请求校验失败/);
  }
  assert.equal(s.app.jobs.size,0);
 }finally{await s.app.unload();s.fixture.close();}
});

test('cross-site and same-site requests cannot read tokens or mutate even with a known token',async()=>{
 const s=setup();
 try{
  await s.app.load();await s.app.task;
  for(const site of ['cross-site','same-site'])for(const method of ['GET','POST']){
   const res=response();s.routes.get(method+' '+BASE+(method==='GET'?'/status':'/action'))!({method,context,headers:{'sec-fetch-site':site,'x-komari-reports-csrf':s.app.csrfToken},body:'{"action":"sendToday"}'},res);
   assert.equal(res.statusCode,403);assert.doesNotMatch(res.body,new RegExp(s.app.csrfToken));
  }
  assert.equal(s.app.jobs.size,0);
 }finally{await s.app.unload();s.fixture.close();}
});

test('status exposes a fresh token only to administrators and tokens rotate on reload',async()=>{
 const a=setup(),b=setup();
 try{
  await a.app.load();await a.app.task;await b.app.load();await b.app.task;
  assert.notEqual(a.app.csrfToken,b.app.csrfToken);
  const anonymous=response();a.routes.get('GET '+BASE+'/status')!({method:'GET',context:{principal:{roles:[]}},headers:{}},anonymous);
  assert.equal(anonymous.statusCode,403);assert.doesNotMatch(anonymous.body,new RegExp(a.app.csrfToken));
  const admin=response();a.routes.get('GET '+BASE+'/status')!({method:'GET',context,headers:{'sec-fetch-site':'same-origin'}},admin);
  assert.equal(JSON.parse(admin.body).csrfToken,a.app.csrfToken);
  const stale=response();b.routes.get('POST '+BASE+'/action')!({method:'POST',context,headers:{'x-komari-reports-csrf':a.app.csrfToken},body:'{"action":"test"}'},stale);
  assert.equal(stale.statusCode,403);
 }finally{await a.app.unload();await b.app.unload();a.fixture.close();b.fixture.close();}
});
