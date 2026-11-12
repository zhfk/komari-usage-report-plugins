import {localDateTime} from './scheduler.ts';
import {escapeHtml} from './statistics.ts';
import {safeText,type Report,type Metric} from './domain.ts';
import type {Config} from './config.ts';
export function bytes(n:number|null):string{if(n===null||!Number.isFinite(n)||n<0)return '数据不足';const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++;}return `${n.toFixed(i?2:0)} ${units[i]}`;}
function metric(m:Metric){return bytes(m.value)+(m.quality==='estimated'?'（估算）':'');}
function pct(n:number|null){return n===null?'数据不足':`${(n*100).toFixed(2)}%`;}
function duration(ms:number){return `${Math.round(ms/60000)} 分钟`;}
function local(time:number,zone:string){return localDateTime(time,zone);}
export function reportLines(r:Report,c:Config):string[]{
 const alerts=r.events.filter(e=>['Offline','Alert'].includes(e.type));
 const network=r.nodes.flatMap(n=>n.ping.filter(p=>(p.average!==null&&p.average>c.pingAverageMs)||(p.loss!==null&&p.loss>c.pingLossPercent)||(p.max!==null&&p.max>c.pingSingleMs)).map(p=>`${n.name} / ${p.name}`));
 const lines=[`📊 Komari ${r.kind==='daily'?'每日监控日报':'每周监控周报'}`,`📅 ${local(r.period.start,c.timezone)} 至 ${local(r.period.end,c.timezone)}（不含结束时点）`,`🌏 ${c.timezone}`,'',`🖥️ 参与统计：${r.nodes.length} 台`,
 (alerts.length||network.length)?'⚠️ 发现监控异常或网络阈值超限':r.complete?'✅ 已采集数据未发现监控异常':'⚠️ 数据不足，无法确认全部监控状态'];
 if(c.traffic){const sum=(k:'upload'|'download')=>r.nodes.length&&r.nodes.every(n=>n[k].value!==null)?r.nodes.reduce((a,n)=>a+n[k].value!,0):null;lines.push(`📊 总流量：${bytes(r.total)}`,`⬆️ 上传：${bytes(sum('upload'))}`,`⬇️ 下载：${bytes(sum('download'))}`);}
 if(c.uptime){const online=r.nodes.reduce((a,n)=>a+n.uptime.online,0),offline=r.nodes.reduce((a,n)=>a+n.uptime.offline,0);lines.push(`🟢 综合在线率：${pct(online+offline?online/(online+offline):null)}（观察估算）`);}
 if(c.comparison&&c.traffic)lines.push(r.previousTotal!==null&&r.previousTotal>0&&r.total!==null&&r.complete?`📈 较上一同类周期：${((r.total-r.previousTotal)/r.previousTotal*100).toFixed(1)}%`:'📈 缺少有效对比数据');
 const nodes=[...r.nodes].sort((a,b)=>c.sort==='traffic'?(b.upload.value||0)+(b.download.value||0)-(a.upload.value||0)-(a.download.value||0):c.sort==='uptime'?(b.uptime.rate??-1)-(a.uptime.rate??-1):a.name.localeCompare(b.name));
 lines.push('','🖥️ 节点详细统计');
 for(const n of nodes){lines.push('',n.name);if(c.traffic)lines.push(`⬆️ ${metric(n.upload)} / ⬇️ ${metric(n.download)} / 合计 ${bytes(n.upload.value!==null&&n.download.value!==null?n.upload.value+n.download.value:null)}`);
  if(c.ping){if(!n.ping.length)lines.push('📡 未取得 Ping 样本或未配置任务');for(const p of n.ping){lines.push(`网络质量：${(p.average!==null&&p.average>c.pingAverageMs)||(p.loss!==null&&p.loss>c.pingLossPercent)||(p.max!==null&&p.max>c.pingSingleMs)?'阈值超限':p.average===null?'数据不足':'已有样本未发现阈值超限'}`,`📡 ${p.name}：平均 ${p.average===null?'未知':p.average.toFixed(1)+' ms'} / 最低 ${p.min??'未知'} / 最高 ${p.max??'未知'} ms`, `成功 ${p.success} / 失败 ${p.failure??'无法计算'} / 丢包率 ${p.loss===null?'无法计算':p.loss.toFixed(2)+'%'} / 超阈值 ${p.above??'无法计算'}`);}}
  if(c.uptime)lines.push(`🟢 在线率 ${pct(n.uptime.rate)} / 离线 ${duration(n.uptime.offline)} / 未知 ${duration(n.uptime.unknown)}`);
  if(c.offline)lines.push(`观察离线 ${n.uptime.count} 次 / 最长离线片段 ${duration(n.uptime.longest)}（估算，非原生事件次数）`);
  if(c.expiry&&n.expired!==null)lines.push(`⏰ 到期：${local(n.expired,c.timezone)} / 距报告生成 ${Math.ceil((n.expired-r.generated)/86400000)} 天`);
  if(c.completeness&&c.traffic)lines.push(`流量样本 ↑${n.upload.samples} ↓${n.download.samples}；首尾覆盖 ↑${(n.upload.coverage*100).toFixed(1)}% ↓${(n.download.coverage*100).toFixed(1)}%`);
 }
 if(c.rankings&&r.kind==='weekly'){
  lines.push('','🏆 本周流量排名（缺失数据不参与）');r.nodes.filter(n=>n.upload.value!==null&&n.download.value!==null).sort((a,b)=>(b.upload.value!+b.download.value!)-(a.upload.value!+a.download.value!)).forEach((n,i)=>lines.push(`${i+1}. ${n.name}：${bytes(n.upload.value!+n.download.value!)}`));
  if(c.uptime){lines.push('','🏆 稳定性排名（仅未知时长为零的观察记录）');r.nodes.filter(n=>n.uptime.unknown===0&&n.uptime.rate!==null).sort((a,b)=>b.uptime.rate!-a.uptime.rate!).forEach((n,i)=>lines.push(`${i+1}. ${n.name}：${pct(n.uptime.rate)}`));}
 }
 lines.push('','🚨 监控事件');
 const events=r.events.filter(e=>e.type==='Offline'||e.type==='Online'?c.offline:e.type==='Expire'?c.expiry:e.type==='Renew'?c.renewal:e.type==='Alert'?(/cpu/i.test(e.message)?c.cpu:/memory|内存/i.test(e.message)?c.memory:/disk|磁盘/i.test(e.message)?c.disk:/load|负载/i.test(e.message)?c.load:c.cpu||c.memory||c.disk||c.load):true);
 if(events.length){const counts:Record<string,number>={};for(const e of events)counts[e.originalType]=(counts[e.originalType]||0)+1;lines.push(`共 ${events.length} 条，受影响节点 ${new Set(events.map(e=>e.uuid).filter(Boolean)).size} 台`,Object.entries(counts).map(([t,n])=>`${t} ${n}`).join(' / '));for(const e of events.slice(0,c.maxEvents))lines.push(`${local(e.time,c.timezone)} ${e.name} [${e.originalType}] ${e.message}${e.type==='Renew'?'（续费事件，结果未确认）':''}${e.type==='Alert'?'（恢复时间未知）':''}`);if(events.length>c.maxEvents)lines.push(`另有 ${events.length-c.maxEvents} 条，请导出事件查看`);}
 else lines.push(c.eventForwarding?'已转发记录中未发现事件；覆盖范围见下方说明':'原生事件历史不可用');
 if(r.kind==='weekly'&&events.length){const counts=new Map<string,number>();for(const e of events.filter(e=>e.type==='Alert'))counts.set(e.name,(counts.get(e.name)||0)+1);lines.push('','告警最多的节点',...[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>`${name}：${count} 次`),'原生事件未提供统一严重等级，无法可靠确定最严重告警。');}
 if(c.expiry){const upcoming=r.nodes.filter(n=>n.expired!==null&&n.expired>=r.generated&&n.expired-r.generated<=30*86400000);if(upcoming.length)lines.push('','⏰ 未来 30 天到期节点',...upcoming.map(n=>`${n.name}：${local(n.expired!,c.timezone)}`));}
 if(network.length)lines.push('','📡 网络阈值超限',...network);
 if(c.completeness)lines.push('','⚠️ 数据说明',...r.notes,...new Set(r.nodes.flatMap(n=>n.notes)),...(c.ping?['Ping 为官方历史聚合值，可能受失败样本混合与数据保留影响；不合并不同目标延迟。']:[]));
 if(c.summary)lines.push('',r.complete&&!alerts.length&&!network.length?'✅ 已采集数据未发现异常，请结合数据覆盖情况判断。':'💡 请关注异常和数据缺口；没有采集到数据不代表正常。');
 lines.push('','📨 Komari 自动监控报告');return lines.map(x=>safeText(x,6000));
}
/** Split plain logical lines first, then escape; never cuts an HTML entity or surrogate pair. */
export function paginate(lines:string[],maxLength:number):string[]{
 const bodies:string[]=[];let current='';
 for(const line of lines){for(const ch of Array.from(line+'\n')){const escaped=escapeHtml(ch);if(current.length+escaped.length>maxLength-40){bodies.push(current);current='';}current+=escaped;}}
 if(current)bodies.push(current);return bodies.map((t,i)=>`[${i+1}/${bodies.length}]\n${t}`);
}
