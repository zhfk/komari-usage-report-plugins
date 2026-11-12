# 可选的监控事件转发

基础的 Telegram 通知插件负责发送消息，不会自动采集上下线、告警、到期和续费事件。本方案只适用于已经使用 **JavaScript 通知渠道**、且能提供 `sendMessage(message, title)` 的现有通知脚本。

Komari 选择的通知渠道决定实际发送方式。选择 Telegram 通知插件时，直接按 README 配置 Bot Token、Chat ID 即可；不要把 JavaScript 代码粘贴到该插件的凭据字段中。

若要使用下面的脚本转发方案，需要切换到 JavaScript 通知渠道，由现有脚本继续负责 Telegram 发送。请先备份原脚本，并确认它自身能正常发送消息。

1. 在本插件配置 `eventSecret` 中填写随机生成的至少 32 字符密钥。
2. 将 [notification-forwarder.js](../examples/notification-forwarder.js) 追加到现有通知脚本末尾。
3. 将 `REPORT_PLUGIN_URL` 设置为你的 Komari HTTPS 地址加 `/api/plugins/komari-daily-weekly-reports/events`。
4. 将 `REPORT_PLUGIN_SECRET` 设置为与 `eventSecret` 相同的密钥；不要公开密钥。
5. 确认原脚本在同一作用域提供 `sendMessage(message, title)`；函数名不同，请调整示例中的对应调用。
6. 开启本插件的 `eventForwarding`，保存配置，检查原有即时告警及报告发送都正常。

Telegram 发送函数应使用 HTML `parse_mode`，不要再次转义报告正文。该地址是带密钥校验的事件接收 API，不是插件管理页面。

恢复原方案时移除追加脚本，关闭 `eventForwarding`，再恢复原有通知渠道。转发前或插件停机期间的事件无法自动恢复；报告会说明记录范围。
