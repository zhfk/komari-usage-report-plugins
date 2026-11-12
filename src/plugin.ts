// This file is bundled as a plain global script, not a CommonJS entry module.
import {App} from './app.ts';
import type {Disk} from './storage.ts';
import type {Server} from './app.ts';
declare const __storageDir__:string;
const server=require('server') as Server;
const fs=require('fs') as Disk;
let application:App|null=null;
async function start(){if(application)return;application=new App(server,fs,__storageDir__);await application.load();}
async function stop(){await application?.unload();application=null;}
// Lifecycle names must be visible at global scope in MoeJS.
(globalThis as any).__komariReports={start,stop};
