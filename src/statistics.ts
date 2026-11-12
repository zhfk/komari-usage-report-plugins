/** Pure calculations. Times are milliseconds since the Unix epoch; intervals are [start, end). */
export type Sample = { time: number; value: number };
export type Result<T> = { value: T | null; quality: 'complete' | 'partial' | 'unavailable'; reason?: string };

/** Counter deltas cannot be recovered across resets or missing boundaries. */
export function counterUsage(samples: Sample[], start: number, end: number, maxGap: number): Result<number> {
  if (!(Number.isFinite(start) && Number.isFinite(end) && start < end && Number.isFinite(maxGap) && maxGap > 0)) throw new Error('Invalid interval');
  const valid = samples.filter(s => Number.isFinite(s.time) && Number.isFinite(s.value) && s.value >= 0 && s.time >= start && s.time <= end).sort((a,b) => a.time-b.time);
  const points: Sample[] = [];
  let duplicate = false;
  for (const p of valid) {
    const last = points[points.length-1];
    if (last && last.time === p.time) { if (last.value !== p.value) duplicate = true; continue; }
    points.push(p);
  }
  if (points.length < 2) return {value:null, quality:'unavailable', reason:'有效采样不足'};
  let total = 0, reset = false, gap = false;
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    if (b.time-a.time > maxGap) gap=true;
    if (b.value < a.value) { reset=true; continue; }
    total += b.value-a.value;
  }
  const incomplete = points[0].time !== start || points[points.length-1].time !== end || reset || gap || duplicate;
  return {value:total, quality:incomplete?'partial':'complete', ...(incomplete?{reason:'边界、采样间隔、重复时间戳或计数器重置导致统计不完整'}:{})};
}

export function pingStats(values: number[], failures: number | null, threshold: number) {
  const v=values.filter(n=>Number.isFinite(n) && n>=0);
  if (!Number.isFinite(threshold)||threshold<0) throw new Error('Invalid threshold');
  if (failures !== null && (!Number.isInteger(failures) || failures<0)) throw new Error('Invalid failure count');
  const attempts=failures===null?null:v.length+failures;
  return {samples:v.length, average:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,
    min:v.length?v.reduce((a,b)=>Math.min(a,b),Infinity):null, max:v.length?v.reduce((a,b)=>Math.max(a,b),-Infinity):null,
    aboveThreshold:v.filter(n=>n>threshold).length, failures,
    lossRate:attempts ? failures! / attempts : null};
}

export type StateInterval = { start:number; end:number; state:'online'|'offline'|'unknown' };
/** Reject overlaps rather than silently double-count them. Unknown time is excluded from denominator. */
export function uptime(intervals: StateInterval[], start:number, end:number) {
  if (!(Number.isFinite(start) && Number.isFinite(end) && start<end)) throw new Error('Invalid interval');
  let online=0, offline=0, unknown=0, cursor=start;
  if(intervals.some(x=>!Number.isFinite(x.start)||!Number.isFinite(x.end)||x.end<x.start||!['online','offline','unknown'].includes(x.state)))throw new Error('Invalid state interval');
  const clipped=intervals.map(x=>({...x,start:Math.max(start,x.start),end:Math.min(end,x.end)})).filter(x=>x.start<x.end).sort((a,b)=>a.start-b.start);
  for (const x of clipped) {
    if (!Number.isFinite(x.start) || !Number.isFinite(x.end) || !['online','offline','unknown'].includes(x.state)) throw new Error('Invalid state interval');
    if (x.start<cursor) throw new Error('Overlapping intervals');
    unknown+=x.start-cursor;
    const duration=x.end-x.start;
    if(x.state==='online') online+=duration; else if(x.state==='offline') offline+=duration; else unknown+=duration;
    cursor=x.end;
  }
  unknown+=end-cursor;
  return {online,offline,unknown,rate:online+offline ? online/(online+offline) : null, quality:unknown?'partial':'complete'};
}

export function comparison(current:number|null, previous:number|null, complete:boolean):number|null {
  if (!complete || current===null || previous===null || !Number.isFinite(current) || !Number.isFinite(previous) || previous<=0) return null;
  return (current-previous)/previous*100;
}
export function escapeHtml(text:string):string { return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
export function monitoringStatus(coverageComplete:boolean, anomalyCount:number):'正常'|'异常'|'数据不足' {
  if (anomalyCount>0) return '异常';
  return coverageComplete?'正常':'数据不足';
}
