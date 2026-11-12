首个可打包 Beta，供真实 Komari 环境测试。目标接口版本：Komari 1.6.1。

支持日报/周报时区调度、无异常与数据缺失报告、节点流量增量统计、分任务 Ping、在线观察估算、原生事件转发与持久化、手动预览/补发、分页发送状态、保守重试、备份导出和托管配置。

下载 `komari-daily-weekly-reports-0.1.0-beta.1.zip` 上传到 Komari 插件管理；不要上传 GitHub 自动生成的源代码 ZIP。安装与通知转发配置请阅读 README。

验证：类型检查、63 项自动化模拟/单元测试、编译后入口的加载与卸载检查、ZIP 结构和 CRC 校验。未连接真实 Komari 或 Telegram，不声称实机测试成功。

限制：在线率与离线时长由每分钟观察估算；安装前数据未知。Ping 历史聚合无法恢复精确超阈值次数；丢包来源不足时显示无法计算。原生事件需追加转发脚本；恢复时间、严重等级、续费结果没有可靠来源时不推断。通知 accepted 只表示 RPC 正常返回，不能证明 Telegram 送达。详见 docs/acceptance.md 和 docs/compatibility.md。
