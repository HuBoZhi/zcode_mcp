# zcode-mcp

<div align="center">

**让 GPT 负责思考,让 zcode 负责写码。**
Delegate coding to zcode from any MCP client — Codex, Claude Code, Cursor...

[![version](https://img.shields.io/badge/version-0.2.0-blue)]()
[![zcode](https://img.shields.io/badge/zcode-0.16.9%20%7C%200.17.1%20tested-green)]()
[![node](https://img.shields.io/badge/node-%E2%89%A518%20(server)%20%E2%89%A524%20(zcode%200.17%2B)-yellow)]()
[![platform](https://img.shields.io/badge/platform-macOS-lightgrey)]()
[![license](https://img.shields.io/badge/license-MIT-black)]()

</div>

把本机 [ZCode](https://zcode.z.ai) 桌面版的 agent 能力(GLM-5.3、文件读写、shell、git、自验证)封装成 **MCP 工具**,供其他 coding agent 调用。贵模型只出思路,活儿交给本地 zcode——**省 token、省订阅**。

```
┌────────────┐   MCP (stdio)   ┌──────────────────┐  ZCode Protocol (stdio)  ┌─────────────────────┐
│  Codex/GPT │ ──────────────▶ │    zcode-mcp     │ ───────────────────────▶ │ zcode app-server    │
│  (大脑)    │ ◀────────────── │  (翻译层)        │ ◀─────────────────────── │ (GLM-5.3 干活)      │
└────────────┘                 └──────────────────┘                          └─────────────────────┘
```

zcode 没有官方 `mcp serve`,CLI `-p` 无头模式又无法指定模型;本项目逆向了 ZCode 桌面版驱动 agent 的内部协议(`zcode app-server`),补齐了模型选择、多轮会话、事件流与凭据注入。

## 📋 目录

- [亮点](#-亮点)
- [工具一览](#-工具一览)
- [快速开始](#-快速开始)
- [接入配置](#-接入配置)
- [使用示例](#-使用示例)
- [配置参考](#-配置参考)
- [工作原理](#-工作原理)
- [排障](#-排障)
- [同类项目对比](#-同类项目对比)
- [FAQ](#-faq)
- [安全须知](#-安全须知)
- [开发](#-开发)

## ✨ 亮点

- **真·agent 委派**——不是单轮问答:zcode 在目标目录里自主读改文件、跑命令、跑 git、自验证,返回最终答复 + 会话 id
- **多轮会话**——`session_id` 续接上一轮,上下文不丢,追问不用重复铺陈
- **零额外登录**——直接复用 ZCode 桌面版凭据(`~/.zcode/v2/credentials.json`,AES-GCM 加密,运行时解密注入)
- **环境自动适配**——自动导出 macOS 系统根证书解决 api.z.ai 新证书链、自动透传系统代理、自动为 zcode 0.17+ 选用 Node ≥ 24 运行时(便携版,不动系统)
- **Skill 一键部署**——附带 zcode skill(部署/使用/排障指南 + 幂等 setup 脚本)
- **输入边界校验**——所有 MCP 参数(session_id/cwd/mode/reasoning)在进入协议层前经白名单校验

## 🛠️ 工具一览

| 工具 | 签名 | 说明 |
|---|---|---|
| `zcode_run` | `(prompt!, cwd, mode, model, reasoning_level, session_id, timeout_ms)` | 委派任务;返回最终答复 + `session_id` + 工具使用/token/耗时统计 |
| `zcode_check` | `()` | 健康检查:二进制路径、凭据、可用模型;排障第一步 |
| `zcode_sessions` | `(cwd?)` | 列出可续接的历史会话 |

`zcode_run` 参数速查:

| 参数 | 默认 | 说明 |
|---|---|---|
| `prompt` | 必填 | 任务指令,要具体:改什么、在哪、如何验证 |
| `cwd` | server cwd | 目标项目**绝对路径**(文件操作的必备项) |
| `mode` | `yolo` | `plan`(只读分析)/ `build` / `edit` / `yolo`(全自动)/ `guarded`(0.17+ 策略门控) |
| `model` | `GLM-5.3` | 可选 `GLM-5.3-Flash`(机械改动省额度) |
| `reasoning_level` | `max` | `low` / `high` / `max` |
| `session_id` | – | 续接上一轮(来自上次返回值) |
| `timeout_ms` | 600000 | 上限 3600000(1 小时) |

## 🚀 快速开始

**前置:ZCode 桌面版已安装并登录过一次;系统 Node ≥ 18。**

方式 A —— **skill 一键部署**(推荐,zcode 用户):

```bash
git clone https://github.com/TechYan/zcode_mcp.git
bash zcode_mcp/skill/scripts/setup.sh          # 构建 + Node24 运行时 + 注册 Codex/Claude Code
```

装完还能把 `zcode_mcp/skill/` 复制到 `~/.zcode/skills/zcode-mcp/`,以后在 zcode 里说"部署/排障 zcode-mcp"即可触发。

方式 B —— **手动三步**:

```bash
git clone https://github.com/TechYan/zcode_mcp.git && cd zcode_mcp
npm install && npm run build
# 按「接入配置」注册到你的客户端
```

**验证**:客户端里调用 `zcode_check`,期望:

```
binary: /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs
credentials: found (~/.zcode/v2/credentials.json)
models: GLM-5.3, GLM-5.3-Flash
status: ok
```

## ⚙️ 接入配置

**Codex**(`~/.codex/config.toml`,`<repo>` = 仓库绝对路径):

```toml
[mcp_servers.zcode]
command = "node"
args = ["<repo>/dist/index.js"]
```

> Codex 自身有工具调用超时,真实任务动辄数分钟,记得调大;`zcode_run` 侧另有 `timeout_ms`。

**Claude Code**:

```bash
claude mcp add zcode -- node <repo>/dist/index.js
```

**通用 mcpServers**:

```json
{ "mcpServers": { "zcode": { "command": "node", "args": ["<repo>/dist/index.js"] } } }
```

## 🎯 使用示例

外部 agent(Codex/GPT)的典型工作流——先问、再做、再追问:

```
用户:  帮我在 ~/proj 里加一个重试装饰器,单测要过
GPT:   zcode_run(mode=plan, cwd=~/proj,
         prompt="分析项目结构,给出加通用重试装饰器的改造点清单")
       ← zcode 返回改造点清单(只读,未改文件)
GPT:   zcode_run(cwd=~/proj,
         prompt="按清单实现 retry 装饰器 + 单测,跑 pytest 全绿后汇报")
       ← 返回正文 + 元数据:
         session_id: sess_d01ae756-...
         model: GLM-5.3 (account:bigmodel-individual-coding-plan)
         tools_used: Read(12), Edit(3), Bash(2)
         tokens: in=68604 out=312   duration: 25s
GPT:   (审查 diff)zcode_run(session_id=sess_d01ae756..., prompt="单测里补一个超时分支")
       ← 同一会话续接,8s 完成
```

**委派心法**:调用方拆解与审查,zcode 执行;一次一个可验证闭环;prompt 自包含(zcode 看不到调用方上下文);`session_id` 传回续接。更多见 `skill/references/usage.md`。

## ⚙️ 配置参考

| 变量 | 默认 | 说明 |
|---|---|---|
| `ZCODE_BIN` | App 包内 `glm/zcode.cjs` | zcode CLI 入口(绝对路径,`.cjs`) |
| `ZCODE_NODE_BIN` | 自动探测 | app-server 子进程的 Node(zcode 0.17+ 需 ≥ v24) |
| `ZCODE_PROVIDER` | `account:bigmodel-individual-coding-plan` | 首选账号 provider |
| `ZCODE_MODEL` | `GLM-5.3` | 默认模型 |
| `ZCODE_REASONING` | `max` | 默认推理档位 |
| `ZCODE_DEFAULT_CWD` | server 进程 cwd | `zcode_run` 未传 cwd 时的兜底 |
| `ZCODE_MCP_AUTO_PROXY` | `1` | 自动检测 macOS 系统代理并透传(`0` 关闭) |
| `ZCODE_MCP_DEBUG` | – | `1` 时 stderr 输出调试日志 |
| `ZCODE_CREDENTIAL_SECRET` | 机器指纹派生 | 凭据加密密钥(与 zcode 客户端一致,一般无需设) |

场景化组合(抄走即用):

```bash
# 省额度:机械改动走 Flash
ZCODE_MODEL=GLM-5.3-Flash ZCODE_REASONING=high

# 公司代理环境(通常无需手动,自动检测;不生效时显式指定)
HTTPS_PROXY=http://127.0.0.1:7897

# 自定义 Node 运行时(如 volta/nvm 安装的 24)
ZCODE_NODE_BIN=$HOME/.volta/bin/node
```

## 🏗️ 工作原理

zcode 桌面版本身也是 spawn `zcode app-server` 子进程、经一套内部协议驱动 agent;zcode-mcp 在 MCP 侧重演"桌面客户端"角色:

<details>
<summary>协议细节(逆向笔记,改动只涉及 <code>src/protocol.ts</code>)</summary>

- **传输**:stdio 行分隔 JSON。注意**不是 JSON-RPC**——带 `jsonrpc` 键会被严格 zod 校验拒绝;事件类型在 `params.type` 顶层
- **provider 物化**:app-server 不持有账号 provider;由客户端经 `provider/updateAccountConfig` 推送定义(无密钥),并在每次模型请求时响应 `interaction/requestProviderRuntimeHeaders` 注入凭据(运行时解密本地加密 api-key)
- **会话**:`session/create`(mode/model)→ `session/subscribe` → `session/send`(modelSelection 含必填 reasoningLevel)→ `session/event` 至 `turn.completed/failed` → `session/messages` 取结构化结果
- **TLS/代理**:Node 内置 CA 缺 api.z.ai 的 Sectigo 新链 → 自动导出 macOS 系统根证书到 `~/.zcode-mcp-system-roots.pem` 经 `NODE_EXTRA_CA_CERTS` 注入;系统代理经 `HTTPS_PROXY` 透传(zcode 原生支持)
- **运行时**:zcode 0.17+ 的 SQLite 迁移依赖 `node:sqlite isTransaction`(Node ≥ 24)→ 自动选用 `~/.zcode-mcp/runtime/` 便携 Node(官方 tarball 解压即得)/ `ZCODE_NODE_BIN` / 系统 Node≥24,`fork` 的 `execPath` 指定
- **进程隔离**:zcode 入口软链到 `~/.zcode-mcp/zcode-entry.cjs`,子进程以固定字面量参数 fork,无动态命令拼接

</details>

## 🔧 排障

第一步永远是 `zcode_check`;`ZCODE_MCP_DEBUG=1` 可开日志。按症状对号:

| 症状 | 根因 | 处置 |
|---|---|---|
| `zcode 0.17+ requires Node >= 24` / `sql_failed` | Node < 24 缺 `isTransaction` | 跑 `setup.sh` 装便携 Node 24,或设 `ZCODE_NODE_BIN` |
| `no models available` | 桌面版从未登录 | 打开 ZCode 桌面版登录一次 |
| `provider_not_found` | provider 推送未生效 | 重启 server;仍失败设 `ZCODE_PROVIDER` |
| `MODEL_TLS_VALIDATION_FAILED` | Node CA 缺新链 | 确认 `~/.zcode-mcp-system-roots.pem` 存在非空 |
| 连接超时 | Node 不走系统代理 | 自动透传已开启;手动设 `HTTPS_PROXY` |
| `turn timed out` | 任务超时 | 调大 `timeout_ms` 与客户端超时 |
| `A prompt is already running` | 同会话并发 | 每会话串行;或开新会话 |
| `interaction denied` 失败 | 非 yolo 模式权限被自动拒绝 | 无头委派用 `mode: yolo` |

完整版见 `skill/references/troubleshooting.md`。

## 📊 同类项目对比

| 项目 | 做法 | 与本项目差异 |
|---|---|---|
| `claude mcp serve`(官方) | Claude Code 内置 MCP 服务端 | zcode 无对应能力,本项目补位 |
| [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) | 包装 `claude -p` CLI | zcode `-p` 无法选模型不可用,故走 app-server 协议(多轮/事件流/取消更强) |
| [claude-codex-bridge](https://lobehub.com) 等 | 双向桥接其他 CLI | 同形态;本项目面向 zcode + GLM,并解决凭据/TLS/代理本地化 |

## ❓ FAQ

**Q: 默认 yolo 安全吗?** 等于把本机代码执行权交给调用方 agent。只注册给信任的客户端;更保守用 `plan`(只读)起步。

**Q: 能省多少 token?** 编码细节(读文件、跑测试的 IO)全部消耗在 zcode 侧;调用方只花规划与审查。参考:一次典型任务 zcode 侧 in≈70k tokens,调用方仅见数百 token 的答复。

**Q: 桌面版更新会坏吗?** 协议在 0.16.9→0.17.1 间未变;若有变动,全部隔离在 `src/protocol.ts`。0.17 的破坏点是 Node ≥ 24(已自动处理)。

**Q: Windows/Linux?** 当前面向 macOS(ZCode 桌面版路径、系统证书导出、代理探测均为 macOS 实现);协议层本身跨平台。

## 🔒 安全须知

- `zcode_run` 默认 `yolo` 全自动执行——只给信任的 MCP 客户端
- app-server 上抛的权限/用户输入交互(`interaction/*`)被自动**拒绝**(无头无法应答),不会挂起
- 凭据只在本地解密、直传本机 zcode 子进程,不落盘、不出网

## 🧪 开发

```bash
npm run build                      # 编译到 dist/
npm test                           # 冒烟测试(真实起 server + zcode_check)
node scripts/e2e.mjs               # 端到端:zcode_run 真实任务 + 追问 + 会话列表
node scripts/probe.mjs "..."       # 直接驱动 app-server 协议(逆向用)
```

已知限制:ZCode Protocol 为内部接口(已验证 0.16.9 / 0.17.1);`build`/`edit` 模式下需确认的操作会被拒绝失败——无头委派建议 `yolo`;切换 zcode 登录账号需重启 server。

## License

[MIT](./LICENSE)
