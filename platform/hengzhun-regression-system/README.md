# 衡准 CLI 自动化测试 Agent

当前产品入口包括 Windows 本机 `hz-agent` CLI 与 Agent 会话工作台。Controller 负责把自然语言目标转换为受合同约束的 Journey；MCP 是唯一工具边界；Harness SQLite 是测试状态唯一真相源；Worker 使用 Playwright/Midscene 操作浏览器并回写证据。实机截图见[项目首页](../../README.md)。

Flowise 已退出当前产品，不参与构建、启动、运行、恢复、CI 或发布，也不作为回退路径。仓库中的 `flowise/`、I8/I9 资料与旧证据仅用于历史查阅；Git 历史保存其完整旧版说明。

## 启动

在仓库根目录依次运行：

```powershell
.\demo.ps1 prepare
.\demo.ps1 up
.\demo.ps1 status
```

`status` 的 `agent.releaseIdentity` 与 `agent.acceptance.releaseIdentityHash` 必须一致，且身份 Schema 为 `hengzhun-i10-release-identity-v4`。

CLI 入口：

```powershell
.\platform\hengzhun-regression-system\runtime\node-v24.19.0-win-x64\node.exe .\platform\hengzhun-regression-system\agent-cli\bin\hz-agent.mjs doctor
```

`doctor` 检查唯一 BYOK 模型绑定、Harness、MCP、Worker、浏览器和银行服务。其他命令以 `hz-agent.mjs --help` 和[当前能力矩阵](../../docs/current-state/capability-matrix.md)为准。

## Agent 会话工作台

完成银行与 Agent 托管服务启动后，在仓库根目录构建网页并以前台进程启动（另开终端，保持进程运行）：

```powershell
npm.cmd --prefix apps/quality-case-portal run build:agent
& .\platform\hengzhun-regression-system\runtime\node-v24.19.0-win-x64\node.exe .\platform\hengzhun-regression-system\agent-cli\bin\hz-agent-web.mjs
```

打开 `http://127.0.0.1:18790`。网页与CLI共享Harness状态，不建立第二份执行数据库。端口已被使用时不要重复启动或终止未知进程。模型配置仅保存在本机；新对话、历史回读、执行事件及证据入口在同一工作台中。

## 当前证据边界

- ReleaseIdentity、Harness 账本和 `demo.ps1 status` 只使用 v4 当前身份。
- 历史 Flowise/v3 账本不得用于当前 CLI 完成度或发布判定。
- STATIC、CONTRACT、INTEGRATION 与 LIVE_E2E 分级陈述，离线测试不能代替真实验收。
- 当前正式清单为 RF-057 的14银行＋7Agent＋7性能，不再以历史 Full18 判定发布。RF-068 S5 局部验收不代表正式28项或整体GO。
