import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {App,BASE,type Server} from '../src/app.ts';
import {configuration} from '../src/config.ts';
import {config,mockRpc,temp} from './support.ts';

const root=path.join(process.cwd(),'dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'komari-plugin.json'),'utf8'));
const panel=manifest.configuration.data.at(-1).name;
const fixture=temp(),rpc=mockRpc(),routes=new Map<string,(req:any,res:any)=>unknown>();
let settings={...config,dailyEnabled:false,weeklyEnabled:false};
const server:Server={call:rpc.call,getConfig:async()=>settings,cron(){},route(method,url,handler){routes.set(method+' '+url,handler);}};
let app=new App(server,fs,fixture.dir);await app.load();await app.task;
const requests:{method:string;url:string;body?:unknown;site?:string}[]=[];
const json=(res:any,value:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
const host=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url!,'http://127.0.0.1'),authenticated=req.headers.cookie?.includes('qa_admin=1');
  if(url.pathname==='/__qa/state'){if(!authenticated)return json(res,{error:'unauthorized'},403);return json(res,{records:fixture.store.records(),calls:rpc.calls,requests,csrfToken:app.csrfToken});}
  if(url.pathname==='/admin/plugins/config'){
   if(!authenticated)return json(res,{error:'需要管理员身份'},401);
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插件配置</title><style>body{margin:0;padding:20px;font:16px system-ui;background:#f6f7fb}main{max-width:1100px;margin:auto}form{padding:20px;background:white;border-radius:12px;margin-bottom:20px}label{display:inline-flex;align-items:center;gap:8px;margin:8px}input,button{font:inherit;padding:8px}#console{max-width:100%}</style><main><h1>插件配置 · Komari 日报与周报</h1><form id="configuration"><label>报告时区<input name="timezone" value="'+settings.timezone+'"></label><label>启用日报<input type="checkbox" name="dailyEnabled" '+(settings.dailyEnabled?'checked':'')+'></label><button>保存配置</button><span id="saved"></span></form><div id="console">'+panel+'</div></main><script>document.querySelector("form").onsubmit=async e=>{e.preventDefault();const f=e.target;const r=await fetch("/api/admin/plugin/configuration",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({short:"komari-daily-weekly-reports",data:{timezone:f.timezone.value,dailyEnabled:f.dailyEnabled.checked}})});document.querySelector("#saved").textContent=r.ok?"配置已保存":"保存失败";};</script></html>');return;
  }
  let body='';for await(const chunk of req)body+=chunk;
  if(url.pathname==='/api/admin/plugin/configuration'&&req.method==='POST'){
   if(!authenticated)return json(res,{error:'需要管理员身份'},403);
   settings=configuration({...settings,...JSON.parse(body).data});await app.unload();routes.clear();app=new App(server,fs,fixture.dir);await app.load();await app.task;
   return json(res,{status:'success',data:null});
  }
  if(url.pathname.startsWith('/api/admin/plugin/komari-daily-weekly-reports/')){
   if(!authenticated)return json(res,{error:'需要管理员身份'},403);
   return json(res,{error:'page not found'},404);
  }
  const handler=routes.get(req.method+' '+url.pathname);
  if(!handler)return json(res,{error:'not found'},404);
  const headers={...req.headers};delete headers.host;
  requests.push({method:req.method!,url:url.pathname,body:body?JSON.parse(body):undefined,site:typeof headers['sec-fetch-site']==='string'?headers['sec-fetch-site']:undefined});
  await handler({method:req.method,url:req.url,headers,query:Object.fromEntries(url.searchParams),body,context:{principal:{roles:authenticated?['admin']:[]}}},res);
 }catch(e){json(res,{error:e instanceof Error?e.message:String(e)},500);}
});
host.listen(0,'127.0.0.1',()=>{const address=host.address() as any;process.stdout.write(JSON.stringify({port:address.port})+'\n');});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.unload();fixture.close();host.close(()=>process.exit(0));});
