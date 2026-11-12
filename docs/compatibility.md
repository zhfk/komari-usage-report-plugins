# 兼容性与接口核查

核查日期：2026-11-12。目标 Komari 稳定版：1.6.1；SDK 固定为 @komari-monitor/plugin-sdk 1.6.1。源码参考固定 tag 1.6.1，避免把 main 的接口误当发布版能力。

| 核查项 | 实际结果与实现 |
|---|---|
| 生命周期 | 普通脚本全局 load/unload；生产 IIFE 在尾部提供全局函数 |
| 运行时 | MoeJS，支持 Promise、受限 fs/crypto 等兼容模块；不是完整 Node；安装包无 ESM、无 TypeScript |
| 清单与配置 | 官方 SDK assertValidManifest 校验；managed 配置使用 string/number/switch/textbox；通过 textbox 的 HTML 渲染内嵌 srcdoc 操作面板，不注册独立 pages |
| 权限 | node + allowSystemRPC + allowRoutes；没有 allowExec/allowHooks/allowListen/allowAllFileAccess/allowHTMLInject |
| Cron | 官方 scheduler 使用服务器 time.Local；插件使用 @every 1m 轮询，自行计算配置时区边界 |
| 系统 RPC | server.call(method,params) 返回 Promise；reject 包含 code；直接消费 result，不自行套 JSON-RPC 包络 |
| 节点 | common:getNodes 返回 UUID→Client，过滤隐藏与配置节点，仅抽取安全字段 |
| 最新在线状态 | common:getNodesLatestStatus 返回 UUID→recordLike，其中 online 为布尔值；缺少状态为 unknown |
| 流量 | traffic.up/down: gauge、bytes，上报增量；public:queryMetrics 使用 sum；net.total.up/down 才是 counter，net.in/out.rate 是速率 |
| Ping | public:getPingMetricStats: stats[] 含 entity_id、task_id、total、valid、loss、loss_approximate、avg/min/max；loss 单位已经是百分比 |
| 原生样本 | public:queryMetrics series[] 的 points[] 含 time/value/count，series 有 downsampled 和 interval_seconds；仅原始延迟样本可计算超阈值次数 |
| 通知 | admin:sendNotification({event:{event,clients,time,message,emoji}}) 返回 null；可用任意非空自定义事件；可被全局开关或脚本忽略 |
| 订阅事件 | registerNotificationChannel 是替代发送渠道，不能当作全局监听；使用通知 JS 包装器转发到保护路由 |
| 持久化 | __storageDir__ 默认 data/plugin-data/<short>；升级/重新安装保留，卸载删除 |
| FS | 已核对 readFileSync/writeFileSync/renameSync/mkdirSync/readdirSync/unlinkSync；原子 rename 防止半写覆盖，非断电 fsync 保证 |
| 时区能力 | 北京时间和 UTC 无 Intl 依赖；其他时区由 Intl 提供，初始化时校验 |
| 管理操作鉴权 | IdentityMiddleware 提供管理员身份；状态读取仅管理员可用；写操作需要每次加载生成的随机 CSRF 令牌，并拒绝跨站 Fetch Metadata |
| Host 兼容 | Komari 的插件 headers 不包含 Request.Host；不依赖 Host 与 Origin 比较，也不信任外部转发头来放行请求 |
| 页面交付 | ZIP 不包含 HTML/HTM 文件，不声明 pages；旧独立页面文件会在覆盖安装时随旧插件目录移除 |

来源：

- [官方插件开发文档](https://komari-monitor.github.io/komari-document/dev/plugin/index)
- [官方 API 文档](https://komari-monitor.github.io/komari-document/dev/api.html)
- [通知发送实现](https://github.com/komari-monitor/komari/blob/1.6.1/utils/messageSender/sender.go)
- [指标名](https://github.com/komari-monitor/komari/blob/1.6.1/internal/metricstore/metrics.go) 与 [上报映射](https://github.com/komari-monitor/komari/blob/1.6.1/internal/metricstore/report_mapping.go)
- [指标定义](https://github.com/komari-monitor/komari/blob/1.6.1/internal/metricstore/definitions.go) 与 [RPC 指标结构](https://github.com/komari-monitor/komari/blob/1.6.1/web/rpc/jsonrpc/public.metric.go)
- [插件存储目录与卸载](https://github.com/komari-monitor/komari/blob/1.6.1/internal/plugin/plugin.go)
- [SDK](https://github.com/komari-monitor/plugin-sdk)
- [托管配置 HTML 渲染](https://github.com/komari-monitor/komari-web/blob/radix/src/components/admin/ConfigFormTabs.tsx)
- [插件请求头构造](https://github.com/komari-monitor/komari/blob/1.6.1/internal/plugin/hook.go) 与 [随机字节支持](https://github.com/komari-monitor/komari/blob/1.6.1/pkg/jsruntime/crypto/crypto.go)
- [Telegram 通知渠道插件](https://github.com/Akizon77/komari-notification-plugins)

未运行真实服务端、Agent 或 Telegram；源码核查和 Node 模拟测试不能替代真实运行兼容性验证。
