/* Append this after your existing Komari JavaScript notification code.
 * Preserve a backup first. Fill in URL and the same >=32-character plugin secret.
 * Existing sendEvent/sendMessage remains responsible for all real notifications.
 * Forward only sanitized fields; never forward the full clients array (tokens).
 */
const REPORT_PLUGIN_URL = 'https://YOUR-KOMARI/api/plugins/komari-daily-weekly-reports/events';
const REPORT_PLUGIN_SECRET = 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS';
const previousReportSendEvent = typeof sendEvent === 'function' ? sendEvent : null;
sendEvent = async function(event) {
  const report = ['DailyReport', 'WeeklyReport', 'ReportFailure'].includes(String(event.event));
  if (!report) {
    try {
      const response = await fetch(REPORT_PLUGIN_URL, {
        method: 'POST', headers: {'Content-Type':'application/json','Authorization':'Bearer '+REPORT_PLUGIN_SECRET},
        body: JSON.stringify({event:event.event,time:event.time,message:event.message,
          clients:(event.clients||[]).map(c=>({uuid:c.uuid,name:c.name}))})
      });
      if (!response.ok) console.error('Report event forwarding failed: '+response.status);
    } catch (_) { console.error('Report event forwarding failed'); }
  }
  if (report) return await sendMessage(String(event.message || ''), String(event.event || 'Komari'));
  if (previousReportSendEvent) return await previousReportSendEvent(event);
  return await sendMessage(String(event.message || ''), String(event.event || 'Komari'));
};
