# 外网演示版完整银行系统与回归测试平台

本仓库用于建设可在外网演示、评审后可迁移到公司内网的完整系统：

- Fineract/Mifos X 开源银行核心与渠道业务系统；
- 面向银行目标网页的回归测试平台，包括案例、Baseline、RAG、AI 编排、Midscene、Playwright、独立验证、定时回归、失败恢复和证据交付。

外网演示使用虚构或脱敏数据，不接入真实生产资金、监管系统或公司内网。完整边界见 [`docs/architecture/v5.4-external-demo-baseline.md`](docs/architecture/v5.4-external-demo-baseline.md)。

本仓库不是生产银行系统，外网部署前必须完成安全评审、凭据隔离、网络限制和演示数据审计。

## 项目事实与开发入口

- [文档索引](docs/README.md)：状态、架构、设计、工作流、运行与证据。
- [当前能力矩阵](docs/current-state/capability-matrix.md)：区分已验证、部分验证和规划能力。
- [个人全栈固定工作流](docs/workflows/fullstack-development-workflow.md)：契约优先的垂直切片开发顺序。
- [前端设计索引](docs/design/frontend/README.md)：设计系统、页面状态、组件、接口和 201 个预览状态追溯。
- [Agent任务控制面](agent/README.md)：唯一 Backlog、责任域和当前实施计划。
- [本地RAG](rag/README.md)：受控来源、权重、检索域和黄金问题验证。

Python 辅助工具统一使用 Python 3.14 与 uv 锁定环境：

```powershell
uv python install 3.14 --default
uv sync --locked
uv run python scripts/tooling/verify_python_environment.py
```

完整说明见 [Python 与 uv 开发工具链](docs/operations/development-environment/python-toolchain.md)。

This has been tested on Linux Ubuntu 24.04 LTS. Make sure you have Docker and Docker Compose plugin installed

## Quick Start

当前 Docker Compose 启动说明仍针对银行目标系统；回归平台的 v5.4 目标和待验证项见 `docs/archive/architecture/v5.4-reference/`，不应把文档目标状态当作已经实现。

### Automated Installation (Recommended)
```console
bash <(curl -sL https://raw.githubusercontent.com/openMF/mifosx-platform/main/install.sh)
```

### Manual Installation

#### For MariaDB:
```console
cd mariadb
docker compose pull && docker compose down && docker compose up -d && docker compose logs -d
```

#### For PostgreSQL:
```console
cd postgresql
docker compose pull && docker compose down && docker compose up -d && docker compose logs -d
```

## Access

After the services are up and running (it could take some minutes for the first time), open a Web Browser and go to:

**https://localhost**

这里是本地目标系统的快速入口；外网演示版应通过独立 TLS 边缘入口访问，内部核心、数据库、消息与认证端口不得直接暴露。

### Default Credentials:
- **User**: `mifos`
- **Password**: `password`

## Platform-Specific Notes

**Note for Mac Users with ARM Processor:**  
If you are using a Mac with an Apple Silicon (ARM) processor, you will need to add the following line to your `docker-compose.yml` file. 
Add the following line under the `fineract-server` and `web-app` services.

Example:
```yaml
services:
  web-app:
    image: openmf/web-app:dev
    platform: linux/x86_64/v8
    ...

  fineract-server:
    image: openmf/fineract:develop
    platform: linux/x86_64/v8
    ...
```
