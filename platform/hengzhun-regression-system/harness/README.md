# Harness

本模块将实现参数校验、Bearer 鉴权、幂等、SQLite、任务状态机、证据与审计。它不是第二个 Agent，也不直接向 Coze/HiAgent 暴露文件系统、浏览器、数据库或凭据。

当前状态：I2 最小安全内核已实现并可运行。

- 唯一产品数据库：`.data/sqlite/regression_platform.sqlite`。
- 迁移：`migrations/001_i2_core.sql`；启动时自动在事务中应用。
- SQLite 约束：WAL、外键、`busy_timeout`、单写入队列、备份 API、`quick_check`。
- 安全：Bearer Token、内部客户端 allowlist、Zod 请求 Schema、幂等键、不可变审计事件。
- 隔离：`namespace + runId` 贯穿任务、运行、Artifact、Evidence 和审计。
- 文件：原始 Artifact 只进入 `.data/artifacts/`；SQLite 保存元数据、Hash 和受管相对路径，对外不返回本机路径。

Harness 仍不是 Agent，也不执行浏览器操作。Playwright Worker 和真实银行案例从 I3 开始接入。
