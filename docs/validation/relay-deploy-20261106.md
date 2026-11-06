# 项目工具本机部署

2026-11-06，基于 `f339373` 编译并执行 `npm pack`；6 项测试通过，真实模型检查默认跳过。

- 包：`D:/Programs/AgentRelay/packages/zcode-mcp-20261106/zcode-mcp-0.2.0.tgz`。
- SHA-256：`391AEB6F982C6B782EFC2FE1C1712B0CBEED9F24A43DB295B01E9ABC6E2C7013`。
- 部署：`D:/Programs/AgentRelay/zcode-mcp`，保留 runtime、node_modules 和 relay-config，仅更新编译与源码文件及 README。
- 备份：`D:/Programs/AgentRelay/data/zcode-projects-backup-20261106/mcp`。
- Relay 配套提交：`c75891076`，通过现有 stdio 连接调用 zcode_projects 并解析项目 ID、名称与目录。
- 重启本机 Relay 后，实际接口返回 6 个项目，群聊项目下拉框加载成功；选择 MediaDock 核对 ID 与路径通过。
- 未发送模型任务、修改登录凭据或发布 npm 包。
- 完整桌面打包及验收记录位于 Relay 仓库 `docs/validation/zcode-projects-deploy-20261106.md`。
