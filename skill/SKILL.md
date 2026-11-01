---
name: zcode-mcp
description: 部署、注册、使用和排障 zcode-mcp——把本机 zcode agent 封装成 MCP 工具,供 Codex / Claude Code / Cursor 等外部 agent 调用("GPT 思考,zcode 干活")。当用户提到:在 Codex 里用 zcode、让 GPT/其他模型调度 zcode、zcode MCP、zcode-mcp、zcode_run / zcode_check 报错、bridge 部署或注册失败时,使用本 skill。
---

# zcode-mcp

zcode-mcp 是一个 MCP server(仓库: https://github.com/TechYan/zcode_mcp),把本机 ZCode 桌面版的 agent 能力暴露为三个 MCP 工具,让外部 agent 委派编码任务给 zcode:

| 工具 | 用途 |
|---|---|
| `zcode_run` | 委派任务(prompt + cwd + mode/model/session_id/timeout) |
| `zcode_check` | 健康检查(二进制/凭据/模型列表) |
| `zcode_sessions` | 列出可续接的历史会话 |

## 什么时候做什么

1. **首次部署/注册**(用户说"装一下/在 Codex 里能用 zcode"):
   运行 `bash <skill-dir>/scripts/setup.sh` —— 幂等完成:克隆/构建、Node≥24 运行时保障、注册 Codex/Claude Code。详见脚本输出。
2. **验证是否可用**:让客户端调 `zcode_check`,期望 `status: ok` 且 `models:` 非空;或在本地跑 `node scripts/e2e.mjs`(仓库目录)。
3. **使用模式/委派最佳实践**:读 `references/usage.md`。
4. **报错排查**(zcode_run 失败、check 报错、app-server 起不来):读 `references/troubleshooting.md`,按症状表处理。

## 关键事实(出问题先想到这些)

- zcode 0.17+ 的 app-server **必须跑在 Node ≥ 24** 上(`node:sqlite` 迁移依赖 `isTransaction`),server 会自动选用 `~/.zcode-mcp/runtime/` 下的便携 Node 或系统 Node≥24;`ZCODE_NODE_BIN` 可强制指定。
- 凭据复用 ZCode 桌面版登录(`~/.zcode/v2/credentials.json`),无需二次登录;桌面版必须**登录过至少一次**。
- server 进程本身用系统 Node(≥18)即可,只有 zcode 子进程需要 ≥24。
- 默认 `mode: yolo` 等于把本机代码执行权交给调用方 agent,只注册给信任的客户端。

## 注册片段(手工注册时用)

Codex `~/.codex/config.toml`(`<repo>` = 仓库绝对路径):

```toml
[mcp_servers.zcode]
command = "node"
args = ["<repo>/dist/index.js"]
```

Claude Code: `claude mcp add zcode -- node <repo>/dist/index.js`
