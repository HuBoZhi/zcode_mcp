# MCP 权限模式研究与验收

2026-11-06，实现源码 `5332def`。

- 已有 zcode_run.mode 原来只在新建时应用，接续会话忽略该参数。现改为在下一轮提示词之前调用 session/setMode 并验证。
- 新增 zcode_set_mode，仅修改已有空闲会话，不发提示词。本进程执行中的会话拒绝切换。
- 本机后端的计划模式使用 planEnabled 覆盖层，快照仍显示底层 mode；通过 session/events 中的会话事件校验。不带历史的计划会话先重设相同底层策略再进入计划，不在两步之间发提示词。
- 8 项测试通过，真实模型检查默认跳过。真实 app-server 逐一验证 build、edit、guarded、yolo、plan，以及新建计划、重复计划和完全访问转计划。均在 D 盘隔离目录操作，未发送模型请求。
- 与 Relay `8cf792515` 集成后可按群聊 Agent 或任务阶段选择权限，包括接续会话。已部署到原安装目录。
- 包：`D:/Programs/AgentRelay/packages/zcode-mcp-permissions-20261106/zcode-mcp-0.2.0.tgz`，SHA-256 `70A6C6090577C0D16B7844471B4E3FBF58D23739BE2CA169F272DA4DED3636ED`。
- 回滚：`D:/Programs/AgentRelay/data/permissions-backup-20261106/mcp`。保留原 runtime、依赖与 relay-config。
- 当前仍然拒绝无头人工审批请求，不自动代替用户批准；权限模式是确认策略，不是系统沙箱。
- [官方权限说明](https://zcode.z.ai/cn/docs/safety-confirm)。完整桌面验收见 Relay 的 `docs/validation/zcode-permissions-20261106.md`。
