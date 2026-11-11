import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportPeriod, due} from '../src/scheduler.ts';
import {renderReport, type Snapshot} from '../src/report.ts';
import {Delivery, KnownNotSent, type DeliveryState, type Store, type Sender} from '../src/delivery.ts';

class MemoryStore implements Store {
 data=new Map<string,DeliveryState>();
 async get(key:string){const v=this.data.get(key);return v?{...v}:null}
 async put(value:DeliveryState){this.data.set(value.key,{...value})}
}
class FakeSender implements Sender {
 calls:string[]=[]; outcomes:('accepted'|'failed'|'unknown')[]=[];
 async send(message:string){this.calls.push(message);const outcome=this.outcomes.shift()||'accepted';if(outcome==='failed')throw new KnownNotSent('rejected before sending');if(outcome==='unknown')throw Error('connection lost');}
}
async function run(store:MemoryStore,sender:FakeSender,now:number,type:'daily'|'weekly',snapshot:Snapshot){
 const zone='Asia/Shanghai', period=reportPeriod(now,zone,type);
 if(!due(now,zone,type==='daily'?'23:59':'09:00',type))return null;
 const text=renderReport(type,period.startDate,period.endDate,zone,snapshot);
 return new Delivery(store,sender,()=>now).send(period.key,text);
}
const complete:Snapshot={nodeCount:2,upload:0,download:0,alerts:[],complete:true,pingAverage:30,uptimeRate:1};
test('simulation: normal zero-traffic daily report is sent, with previous day and no duplicate after restart',async()=>{
 const store=new MemoryStore(),sender=new FakeSender(),now=Date.parse('2026-11-12T15:59:00Z');
 assert.equal((await run(store,sender,now,'daily',complete))?.status,'accepted');
 assert.match(sender.calls[0],/2026-11-11 至 2026-11-12/);assert.match(sender.calls[0],/未发现监控异常/);assert.match(sender.calls[0],/上传：0 B/);
 await run(store,sender,now,'daily',complete);assert.equal(sender.calls.length,1);
});
test('simulation: normal weekly report is sent for previous Monday to Monday',async()=>{
 const store=new MemoryStore(),sender=new FakeSender(),now=Date.parse('2026-11-16T01:00:00Z');
 await run(store,sender,now,'weekly',complete);assert.equal(sender.calls.length,1);assert.match(sender.calls[0],/2026-11-09 至 2026-11-16/);assert.match(sender.calls[0],/未发现监控异常/);
});
test('simulation: total data outage still sends a clearly uncertain report',async()=>{
 const store=new MemoryStore(),sender=new FakeSender(),now=Date.parse('2026-11-12T15:59:00Z');
 await run(store,sender,now,'daily',{nodeCount:null,upload:null,download:null,pingAverage:null,uptimeRate:null,alerts:[],complete:false,note:'统计失败'});
 assert.equal(sender.calls.length,1);assert.match(sender.calls[0],/统计失败/);assert.match(sender.calls[0],/数据不足/);assert.doesNotMatch(sender.calls[0],/未发现监控异常/);
});
test('simulation: unknown delivery is retained and suppressed after restart',async()=>{
 const store=new MemoryStore(),sender=new FakeSender(),now=Date.parse('2026-11-12T15:59:00Z');sender.outcomes=['unknown'];
 assert.equal((await run(store,sender,now,'daily',complete))?.status,'unknown');
 assert.equal((await run(store,sender,now,'daily',complete))?.status,'unknown');assert.equal(sender.calls.length,1);
});
test('simulation: known failure retries on next explicit scheduler invocation',async()=>{
 const store=new MemoryStore(),sender=new FakeSender(),now=Date.parse('2026-11-12T15:59:00Z');sender.outcomes=['failed','accepted'];
 assert.equal((await run(store,sender,now,'daily',complete))?.status,'failed');assert.equal((await run(store,sender,now,'daily',complete))?.status,'accepted');assert.equal(sender.calls.length,2);
});
test('simulation: before scheduled time does not send',async()=>{
 const store=new MemoryStore(),sender=new FakeSender();assert.equal(await run(store,sender,Date.parse('2026-11-12T15:58:00Z'),'daily',complete),null);assert.equal(sender.calls.length,0);
});
