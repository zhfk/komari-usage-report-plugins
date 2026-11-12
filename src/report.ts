import {escapeHtml,monitoringStatus} from './statistics.ts';
export type Snapshot = {nodeCount:number|null; upload:number|null; download:number|null; alerts:string[]; complete:boolean; pingAverage:number|null; uptimeRate:number|null; note?:string};
function bytes(n:number|null):string {if(n===null||!Number.isFinite(n)||n<0)return '数据不足'; const units=['B','KB','MB','GB','TB']; let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return `${n.toFixed(i?2:0)} ${units[i]}`;}
/** Missing data cannot be described as normal. */
export function renderReport(type:'daily'|'weekly',startDate:string,endDate:string,zone:string,s:Snapshot):string {
 const complete=s.complete && s.nodeCount!==null && Number.isInteger(s.nodeCount) && s.nodeCount>0 && s.upload!==null && Number.isFinite(s.upload) && s.upload>=0 && s.download!==null && Number.isFinite(s.download) && s.download>=0 && s.pingAverage!==null && Number.isFinite(s.pingAverage) && s.pingAverage>=0 && s.uptimeRate!==null && Number.isFinite(s.uptimeRate) && s.uptimeRate>=0 && s.uptimeRate<=1;
 const status=monitoringStatus(complete,s.alerts.length);const title=type==='daily'?'每日监控日报':'每周监控周报';
 return [`📊 Komari ${title}`,`📅 统计范围：${escapeHtml(startDate)} 至 ${escapeHtml(endDate)}（不含结束日）`,`🌏 时区：${escapeHtml(zone)}`,'',`🟢 监控状态：${status}`,
 `🖥️ 服务器：${s.nodeCount===null?'数据不足':`${s.nodeCount} 台`}`,`⬆️ 上传：${bytes(s.upload)}`,`⬇️ 下载：${bytes(s.download)}`,
 `📡 网络延迟：${s.pingAverage===null?"数据不足":`${s.pingAverage.toFixed(1)} ms`}`,`🟢 在线率：${s.uptimeRate===null?"数据不足":`${(s.uptimeRate*100).toFixed(2)}%`}`,'',...s.alerts.map(a=>`⚠️ ${escapeHtml(a)}`),
 ...(s.alerts.length===0?[complete?'✅ 未发现监控异常':'⚠️ 数据不足，无法确认是否存在异常']:[]),
 ...(s.note?[`⚠️ ${escapeHtml(s.note)}`]:[]),'','📨 本报告由 Komari 自动生成'].join('\n');
}
