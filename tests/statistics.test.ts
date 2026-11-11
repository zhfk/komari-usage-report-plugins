import {test} from 'node:test';
import assert from 'node:assert/strict';
import {counterUsage,pingStats,uptime,comparison,escapeHtml,monitoringStatus} from '../src/statistics.ts';
test('counter uses differences and marks reset or missing boundaries',()=>{
 assert.deepEqual(counterUsage([{time:0,value:100},{time:5,value:150},{time:10,value:200}],0,10,5),{value:100,quality:'complete'});
 const r=counterUsage([{time:0,value:100},{time:5,value:20},{time:10,value:30}],0,10,5); assert.equal(r.value,10); assert.equal(r.quality,'partial');
 assert.equal(counterUsage([{time:1,value:0},{time:9,value:1}],0,10,10).quality,'partial');
 assert.equal(counterUsage([{time:0,value:1}],0,10,5).value,null);
});
test('duplicates and gaps do not look complete',()=>{
 assert.equal(counterUsage([{time:0,value:0},{time:0,value:1},{time:10,value:5}],0,10,10).quality,'partial');
 assert.equal(counterUsage([{time:0,value:0},{time:10,value:5}],0,10,5).quality,'partial');
});
test('missing ping failures and empty data never imply zero loss',()=>{
 assert.equal(pingStats([],null,300).lossRate,null); assert.equal(pingStats([],0,300).lossRate,null);
 assert.equal(pingStats([20,40],2,30).lossRate,0.5); assert.equal(pingStats([20,40],null,30).aboveThreshold,1);
});
test('unknown uptime excluded; overlaps rejected',()=>{
 const r=uptime([{start:-5,end:4,state:'online'},{start:4,end:6,state:'offline'}],0,10);
 assert.equal(r.online,4); assert.equal(r.offline,2); assert.equal(r.unknown,4); assert.equal(r.rate,4/6);
 assert.throws(()=>uptime([{start:0,end:5,state:'online'},{start:4,end:6,state:'offline'}],0,10));
});
test('comparison, escaping, and status are conservative',()=>{
 assert.equal(comparison(10,0,true),null); assert.equal(comparison(10,5,false),null); assert.equal(comparison(10,5,true),100);
 assert.equal(escapeHtml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
 assert.equal(monitoringStatus(false,0),'数据不足'); assert.equal(monitoringStatus(true,0),'正常'); assert.equal(monitoringStatus(false,1),'异常');
});
