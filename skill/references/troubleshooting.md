# zcode-mcp 排障手册

先让客户端跑一次 `zcode_check`,再按症状对号入座。

## 症状速查

| 症状 | 根因 | 处置 |
|---|---|---|
| `zcode 0.17+ requires Node >= 24` | 没有 Node ≥ 24 运行时 | `bash scripts/setup.sh`(装便携 Node 24 到 `~/.zcode-mcp/runtime/`)或设 `ZCODE_NODE_BIN`;系统 Node ≥24 也可 |
| `app-server exited (1)` + zcode 日志 `SQLite migration ... sql_failed` | 同上:Node < 24 缺 `isTransaction` | 同上 |
| `no models available` / `Select a model` | 桌面版从未登录,凭据缺失 | 打开 ZCode 桌面版登录一次;再跑 `zcode_check` |
| `provider_not_found` | provider 推送未生效(桌面版换过账号/升级) | 重启 MCP server;仍失败则设 `ZCODE_PROVIDER` 为实际 provider id |
| `MODEL_TLS_VALIDATION_FAILED` / `unable to get local issuer certificate` | Node 内置 CA 缺 z.ai 证书链 | server 会自动导出 macOS 系统根证书到 `~/.zcode-mcp-system-roots.pem`;确认该文件存在且非空,或自备 bundle 设 `NODE_EXTRA_CA_CERTS` |
| 连接超时(无代理环境) | Node 不走系统代理 | server 自动透传 macOS 系统代理;自定义代理设 `HTTPS_PROXY`;关闭自动检测设 `ZCODE_MCP_AUTO_PROXY=0` |
| `turn timed out` | 任务超时 | 调大 `timeout_ms`;检查该 session 是否卡死(客户端侧重开新会话) |
| `A prompt is already running` | 同一 session 并发发送 | 每个会话串行调用;或换新 session(不传 session_id) |
| `zcode turn FAILED: ... interaction denied` | 非 yolo 模式下权限请求被自动拒绝 | 无头委派用 `mode: yolo`;或改任务避免触发确认 |
| `session/resume` 失败 | 目标会话不存在(换了 db/被清理) | 不传 session_id 新开会话 |
| `invalid session_id` | 传入的 id 不符合 `sess_...` 格式 | 用 zcode_run 返回或 zcode_sessions 列出的 id |

## 诊断顺序

1. `zcode_check` → 看 binary / credentials / models 三行。
2. `ZCODE_MCP_DEBUG=1` 重启 server,stderr 有 `[zcode-mcp]` 日志(boot、session、turn event、runtime 选择)。
3. 本地复现:仓库目录跑 `node scripts/e2e.mjs`(需要桌面版已登录)。
4. 深挖协议(仅当上面都正常但特定调用失败):`node scripts/probe.mjs "测试提示词"` 直接驱动 app-server。

## 升级 zcode 桌面版之后

CLI 位于 App 包内,随桌面版更新。大版本更新后:先 `zcode_check`;若 app-server 起不来,优先怀疑运行时(Node 版本要求变化)与协议变动(改动集中在仓库 `src/protocol.ts`,对照 app-server 方法名)。
