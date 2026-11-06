# 贡献指南

先阅读 [README](README.md) 和 [仓库规则](AGENTS.md)，再为具体问题创建 Issue 或 Pull Request。描述复现步骤、预期行为和实际结果，只附脱敏信息。

1. Fork 并创建范围明确的分支；不要提交环境配置、数据库、凭据、运行日志或依赖目录。
2. 核对 [API 合同](contracts/openapi)。银行账务只通过 Fineract API，不直接改核心数据库。
3. 修改实现与必要测试，遵循目录内的 AGENTS.md，保留事务、幂等和认证边界。
4. PR 写清验证命令、实际结果和未验证范围。只运行改动所需的检查，并区分 STATIC / CONTRACT / INTEGRATION / LIVE_E2E。

## 按修改范围验证

| 修改范围 | 验证入口 |
| --- | --- |
| 文档 | `python scripts/docs/validate_docs.py`，使用项目已有 Python 工具链 |
| Java 银行服务 | Java 21，在所属服务目录运行 `mvnw.cmd test`；需要数据库的测试使用隔离合成环境 |
| 前端 | 在所属包按已有 lockfile 安装，运行该包已有的 lint / typecheck / test / build 脚本，不假设每个包都有同名脚本 |
| CLI / Controller / Harness / MCP / Worker | 使用[隔离源码门](scripts/deploy/verify-ci-source-snapshot.ps1)及其固定工具链；不要在正在服务的 Agent 目录执行依赖升级或会改写状态的全套测试 |
| 合同 / 生成物 | 修改源合同后运行其现有生成器和对应合同检查，提交实际需要的生成物，不手改生成结果掩盖偏差 |

公开 CI 不需要用户 BYOK 密钥，确定性测试模型只用于测试进程。真实模型、浏览器业务操作、身份冻结及部署需要对应的环境与授权，不能由 PR 的单元测试结果代替。保留转账幂等、余额约束、未知结果回读和事务边界；不要为测试直接写 Fineract 数据库。

不要将合成模型测试标记为真实 BYOK 验收，不以截图代替业务结果。测试使用自己的隔离合成数据环境。任务状态以 [backlog](agent/backlog.yaml) 为准。

贡献代码按 [MPL-2.0](LICENSE) 提交；引入第三方材料需说明来源与许可证，不上传雇主内部数据或专有资料。
