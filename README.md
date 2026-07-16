# 外网演示版完整银行系统与回归测试平台

本仓库用于建设可在外网演示、评审后可迁移到公司内网的完整系统：

- Fineract/Mifos X 开源银行核心与渠道业务系统；
- 面向银行目标网页的回归测试平台，包括案例、Baseline、RAG、AI 编排、Midscene、Playwright、独立验证、定时回归、失败恢复和证据交付。

外网演示使用虚构或脱敏数据，不接入真实生产资金、监管系统或公司内网。完整边界见 [`docs/architecture/v5.4-external-demo-baseline.md`](docs/architecture/v5.4-external-demo-baseline.md)。

本仓库不是生产银行系统，外网部署前必须完成安全评审、凭据隔离、网络限制和演示数据审计。

## 项目事实与开发入口

- [文档索引](docs/README.md)：状态、架构、设计、工作流、运行与证据。
- [唯一开发顺序](agent/plans/active/v54-implementation-batches.md)：项目级批次、并行关系、入口条件与退出条件的唯一权威。
- [当前能力矩阵](docs/current-state/capability-matrix.md)：区分已验证、部分验证和规划能力。
- [个人全栈固定工作流](docs/workflows/fullstack-development-workflow.md)：契约优先的垂直切片开发顺序。
- [前端设计索引](docs/design/frontend/README.md)：设计系统、页面状态、组件、接口和 201 个预览状态追溯。
- [Agent任务控制面](agent/README.md)：唯一 Backlog、责任域和当前实施计划。
- [本地RAG](rag/README.md)：受控来源、权重、检索域和黄金问题验证。
- [正式文书目录](documents/README.md)：立项、需求、设计、测试、发布、验收与交接文书的状态和来源索引；生成件位于忽略的 `deliverables/`。
- [衡准自动化回归测试系统](platform/hengzhun-regression-system/README.md)：I1 本机平台基础、公开界面一致性结果与一键验证入口。

除“唯一开发顺序”外，其余文档只用于确认参数、接口、架构、技术方案、代码设计、验证方法或证据，不得建立第二套项目排期。

Python 辅助工具统一使用 Python 3.14 与 uv 锁定环境：

```powershell
uv python install 3.14 --default
uv sync --locked
uv run python scripts/tooling/verify_python_environment.py
```

完整说明见 [Python 与 uv 开发工具链](docs/operations/development-environment/python-toolchain.md)。

This has been tested on Linux Ubuntu 24.04 LTS. Make sure you have Docker and Docker Compose plugin installed

## Quick Start

当前 Docker Compose 与访问方式以已锁定的本机运行配置、`docs/baseline/`、服务 README 和实际运行证据为准。回归平台只以 [当前架构基线](docs/architecture/v5.4-external-demo-baseline.md)、[职责边界](docs/architecture/overview/coze-harness-midscene-observability-boundary.md) 与 `agent/backlog.yaml` 为开发依据；文档目标不得当作已经实现。
