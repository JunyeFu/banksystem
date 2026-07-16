# 衡准自动化回归测试系统

本目录是项目自有自动化回归系统的唯一产品根目录。复兴银行被测系统仍在本目录之外；HiAgent 是云端目标平台，不在这里复制或部署。

## 当前状态

I1 的单目录产品边界、固定运行时、结构校验、合成一致性服务、OpenAPI 样例、本机 Coze Studio 0.5.1、受控 Docker 网络、最小 Agent、Knowledge Base 和 Workflow 已真实落地。公开界面验证结果已写入 `tests/conformance/results/`。

I1 不能据实标记为完整通过：当前 Coze Studio 公开界面不支持同结构 Skill 包上传，且资源库未进入可用的 Plugin/OpenAPI 创建表单，导致 `PLAT-V001` 失败、`PLAT-V003` 部分通过、`PLAT-V006` 阻塞。机器基础可用于继续开发无依赖的 Harness/SQLite/Artifact，但不得把未关闭的平台门禁写成可用能力。

## 目录职责

| 路径 | 职责 | 当前声明 |
|---|---|---|
| `coze/` | 可公开上传或导入的 Skill、插件和界面配置制品 | I1 制品、公开界面配置与 Coze Studio 基线已落地 |
| `harness/` | API、安全、任务、状态机、SQLite 与证据控制层 | I1 合成一致性服务已落地；I2 正式内核待实现 |
| `worker/` | Playwright 正式执行与 Midscene 作者化适配 | 待实现 |
| `runtime/` | 固定 Node、Chromium 与本地依赖 | 已迁移副本，需通过校验 |
| `contracts/` | Harness OpenAPI 与数据契约 | I1 合成 OpenAPI 已验证；I2 七工具正式契约待实现 |
| `tests/` | 单元、契约、集成、E2E 与平台一致性测试 | 一致性服务 5 项测试和 6 项 I1 平台结论已落地 |
| `scripts/` | 准备、启动、停止、验证和离线打包入口 | I1 准备、启停、制品打包和完整验证入口已落地 |
| `docs/` | 产品目录内部说明 | 仅辅助设计，不定义项目顺序 |
| `.data/` | SQLite、日志、证据和运行数据 | 本地生成，禁止入库与 RAG |

项目级实施顺序只读取 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)。

## 验证

在本目录执行：

```powershell
.\verify.cmd
```

静态验证不读取凭据；`npm run verify:i1` 还会检查已启动的本机 Coze、固定镜像、内部网络和合成端点。公开界面结论以 `tests/conformance/results/` 为准，不从本地文件存在性推断。
