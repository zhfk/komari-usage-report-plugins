import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
async function wait(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle');}
test('admin DOM: status, preview and test command use protected API and safe text rendering',async()=>{
 const commands:any[]=[];let lastAction='preview';
 const dom=new JSDOM(fs.readFileSync('pages/admin.html','utf8'),{url:'https://komari.test/api/admin/plugin/komari-daily-weekly-reports/pages/admin.html',runScripts:'dangerously',beforeParse(w:any){
  const timer=w.setTimeout.bind(w);w.setTimeout=(fn:any,ms:number)=>timer(fn,Math.min(ms,1));
  w.fetch=async(url:string,options:any={})=>{let value:any;
   if(url.endsWith('/status'))value={version:'test',busy:false,lastTick:1,lastGenerated:1,lastAccepted:1,lastError:'',notificationSemantics:'accepted',logs:[],records:[{id:'r',kind:'daily',period:{startDate:'2026-11-01',endDate:'2026-11-02'},status:'accepted',parts:[{state:'accepted',attempts:1}]}]};
   else if(url.endsWith('/action')){const body=JSON.parse(options.body);commands.push(body);lastAction=body.action;assert.equal(options.credentials,'same-origin');value={id:'job'};}
   else if(url.includes('/jobs?'))value={status:'completed',result:lastAction==='preview'?{parts:['<script>unsafe()</script>']}: {acceptedByKomari:true}};
   else throw Error('Unexpected URL');
   return {ok:true,json:async()=>value};
  };
 }});
 try{const d=dom.window.document;await wait(()=>d.querySelectorAll('#records tr').length===1);assert.equal(d.querySelector('#records button')!.disabled,true);d.getElementById('date').value='2026-11-01';d.getElementById('preview').click();await wait(()=>d.getElementById('previewText').textContent.includes('unsafe'));assert.equal(commands[0].action,'preview');assert.equal(d.querySelector('#previewText script'),null);d.getElementById('test').click();await wait(()=>commands.length===2&&d.getElementById('previewText').textContent.includes('acceptedByKomari'));assert.equal(commands[1].action,'test');}finally{dom.window.close();}
});
test('admin DOM: permission errors are visible instead of reporting success',async()=>{
 const dom=new JSDOM(fs.readFileSync('pages/admin.html','utf8'),{url:'https://komari.test/',runScripts:'dangerously',beforeParse(w:any){w.fetch=async()=>({ok:false,json:async()=>({error:'需要管理员身份'})});}});
 try{await wait(()=>dom.window.document.getElementById('message').textContent.includes('需要管理员身份'));}finally{dom.window.close();}
});
