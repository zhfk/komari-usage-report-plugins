import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
async function wait(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle');}
test('admin DOM: status, preview and test command use protected API and safe text rendering',async()=>{
 const commands:any[]=[];let lastAction='preview';
 const dom=new JSDOM(fs.readFileSync('src/admin-console.html','utf8'),{url:'https://komari.test/admin/plugins/config',runScripts:'dangerously',beforeParse(w:any){
  const timer=w.setTimeout.bind(w);w.setTimeout=(fn:any,ms:number)=>timer(fn,Math.min(ms,1));
  w.fetch=async(url:string,options:any={})=>{let value:any;
   if(url.endsWith('/status'))value={version:'test',csrfToken:'fixture-csrf-token',busy:false,lastTick:1,lastGenerated:1,lastAccepted:1,lastError:'',notificationSemantics:'accepted',logs:[],records:[{id:'r',kind:'daily',period:{startDate:'2026-11-01',endDate:'2026-11-02'},status:'accepted',parts:[{state:'accepted',attempts:1}]}]};
   else if(url.endsWith('/action')){const body=JSON.parse(options.body);commands.push(body);lastAction=body.action;assert.equal(options.credentials,'same-origin');assert.equal(options.headers['X-Komari-Reports-CSRF'],'fixture-csrf-token');value={id:'job'};}
   else if(url.includes('/jobs?'))value={status:'completed',result:lastAction==='preview'?{parts:['<script>unsafe()</script>']}: {acceptedByKomari:true}};
   else throw Error('Unexpected URL');
   return {ok:true,json:async()=>value};
  };
 }});
 try{const d=dom.window.document;await wait(()=>d.querySelectorAll('#records tr').length===1);assert.equal(d.querySelector('#records button')!.disabled,true);d.getElementById('date').value='2026-11-01';d.getElementById('preview').click();await wait(()=>d.getElementById('previewText').textContent.includes('unsafe'));assert.equal(commands[0].action,'preview');assert.equal(d.querySelector('#previewText script'),null);d.getElementById('test').click();await wait(()=>commands.length===2&&d.getElementById('previewText').textContent.includes('acceptedByKomari'));assert.equal(commands[1].action,'test');}finally{dom.window.close();}
});
test('admin DOM: permission errors are visible instead of reporting success',async()=>{
 const dom=new JSDOM(fs.readFileSync('src/admin-console.html','utf8'),{url:'https://komari.test/',runScripts:'dangerously',beforeParse(w:any){w.fetch=async()=>({ok:false,json:async()=>({error:'需要管理员身份'})});}});
 try{await wait(()=>dom.window.document.getElementById('message').textContent.includes('需要管理员身份'));}finally{dom.window.close();}
});
test('admin DOM: send today button ignores historical controls and prevents a second click while running',async()=>{
 const commands:any[]=[];
 const dom=new JSDOM(fs.readFileSync('src/admin-console.html','utf8'),{url:'https://komari.test/admin/plugins/config',runScripts:'dangerously',beforeParse(w:any){
  const timer=w.setTimeout.bind(w);w.setTimeout=(fn:any,ms:number)=>timer(fn,Math.min(ms,1));
  w.fetch=async(url:string,options:any={})=>{
   let value:any;
   if(url.endsWith('/status'))value={version:'test',csrfToken:'fixture-csrf-token',busy:false,lastTick:1,lastGenerated:null,lastAccepted:null,lastError:'',notificationSemantics:'accepted',logs:[],records:[]};
   else if(url.endsWith('/action')){commands.push(JSON.parse(options.body));assert.equal(options.credentials,'same-origin');value={id:'today'};}
   else if(url.includes('/jobs?'))value={status:'completed',result:{parts:[{text:'今日日报',state:'accepted'}]}};
   else throw Error('Unexpected URL');
   return {ok:true,json:async()=>value};
  };
 }});
 try{
  const d=dom.window.document;await wait(()=>d.getElementById('status').textContent.includes('版本'));
  const button=d.getElementById('sendToday');assert.ok(button);
  d.getElementById('date').value='2099-01-01';d.getElementById('kind').value='weekly';
  button.click();assert.equal(button.disabled,true);button.click();
  await wait(()=>commands.length===1&&!button.disabled&&d.getElementById('previewText').textContent.includes('今日日报'));
  assert.deepEqual(commands,[{action:'sendToday'}]);
  assert.match(button.textContent,/发送今日日报/);
 }finally{dom.window.close();}
});
