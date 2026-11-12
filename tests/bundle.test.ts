import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {temp,mockRpc,config} from './support.ts';
const require=createRequire(import.meta.url);
test('compiled ZIP entry loads and unloads using only the declared runtime modules',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'pipe'});const t=temp(),rpc=mockRpc();let registrations=0;
 const server={call:rpc.call,getConfig:async()=>({...config,dailyEnabled:false,weeklyEnabled:false}),cron(){registrations++},route(){}};
 const context=vm.createContext({console,require:(name:string)=>{if(name==='server')return server;if(['fs','node:crypto','node:buffer'].includes(name))return require(name);throw Error('Unexpected runtime dependency '+name)},__storageDir__:t.dir,URL,Intl,Date,Buffer});
 try{vm.runInContext(fs.readFileSync('dist/script.js','utf8'),context);assert.equal(typeof context.load,'function');assert.equal(typeof context.unload,'function');await context.load();assert.equal(registrations,1);await context.unload();assert.ok(fs.existsSync(t.dir+'/meta.json'));}finally{t.close();}
});
