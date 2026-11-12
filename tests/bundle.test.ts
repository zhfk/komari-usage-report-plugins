import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {temp,mockRpc,config} from './support.ts';
const require=createRequire(import.meta.url);
test('compiled ZIP entry loads and unloads using only the declared runtime modules',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'pipe'});const t=temp(),rpc=mockRpc();let registrations=0;
 const manifest=JSON.parse(fs.readFileSync('dist/komari-plugin.json','utf8'));
 assert.equal(manifest.pages,undefined);
 assert.equal(manifest.permissions.allowHTMLInject,undefined);
 const panel=manifest.configuration.data.at(-1);assert.equal(panel.type,'textbox');
 const {JSDOM}=require('jsdom'),markup=new JSDOM(panel.name),frame=markup.window.document.querySelector('iframe');
 assert.ok(frame);assert.equal(frame.hasAttribute('src'),false);
 assert.equal(frame.getAttribute('srcdoc'),fs.readFileSync('src/admin-console.html','utf8'));
 assert.doesNotMatch(frame.getAttribute('srcdoc'),/pages\/admin\.html/);
 assert.equal(fs.readdirSync('dist',{recursive:true}).some(name=>/\.html?$/i.test(String(name))),false);
 markup.window.close();
 const server={call:rpc.call,getConfig:async()=>({...config,dailyEnabled:false,weeklyEnabled:false}),cron(){registrations++},route(){}};
 const context=vm.createContext({console,require:(name:string)=>{if(name==='server')return server;if(['fs','node:crypto','node:buffer'].includes(name))return require(name);throw Error('Unexpected runtime dependency '+name)},__storageDir__:t.dir,URL,Intl,Date,Buffer});
 try{vm.runInContext(fs.readFileSync('dist/script.js','utf8'),context);assert.equal(typeof context.load,'function');assert.equal(typeof context.unload,'function');await context.load();assert.equal(registrations,1);await context.unload();assert.ok(fs.existsSync(t.dir+'/meta.json'));}finally{t.close();}
});
