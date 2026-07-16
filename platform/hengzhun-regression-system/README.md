# 衡准自动化回归测试系统

本目录是项目自有自动化回归系统的唯一产品根目录。复兴银行被测系统仍在本目录之外；HiAgent 是云端目标平台，不在这里复制或部署。

## 当前状态

I1 的单目录产品边界、固定运行时、结构校验、合成一致性服务、OpenAPI 样例、本机 Coze Studio 0.5.1、受控 Docker 网络、最小 Agent、Knowledge Base 和 Workflow 已真实落地。I2 的 TypeScript/Node Harness、SQLite 单库、七工具 OpenAPI、Bearer/allowlist、安全审计、幂等、输出预算和 Artifact 元数据内核也已落地。公开界面与内核验证结果写入 `tests/conformance/results/`。

I1 不能据实标记为完整通过：当前 Coze Studio 公开界面不支持同结构 Skill 包上传，资源库的“资源”菜单也未能进入可用的 Plugin/OpenAPI 创建表单。I2 已完成 Harness 侧的 `PLAT-V005`、`PLAT-V008` 和 `PLAT-V004` 可导入契约验证；真实 Plugin 导入、发布和七工具调用仍属于 I3 门禁，不得冒充完成。

## 目录职责

| 路径 | 职责 | 当前声明 |
|---|---|---|
| `coze/` | 可公开上传或导入的 Skill、插件和界面配置制品 | I1 制品、公开界面配置与 Coze Studio 基线已落地 |
| `harness/` | API、安全、任务、状态机、SQLite 与证据控制层 | I2 最小安全内核已落地；Worker 执行仍待 I3 |
| `worker/` | Playwright 正式执行与 Midscene 作者化适配 | 待实现 |
| `runtime/` | 固定 Node、Chromium 与本地依赖 | 已迁移副本，需通过校验 |
| `contracts/` | Harness OpenAPI 与数据契约 | 七工具 OpenAPI 3.0.3 契约已版本化并通过静态导入校验 |
| `tests/` | 单元、契约、集成、E2E 与平台一致性测试 | I2 数据库、安全、七工具、隔离、幂等和输出预算测试已落地 |
| `scripts/` | 准备、启动、停止、验证和离线打包入口 | I1/I2 准备、启停与验证入口已落地 |
| `docs/` | 产品目录内部说明 | 仅辅助设计，不定义项目顺序 |
| `.data/` | SQLite、日志、证据和运行数据 | 本地生成，禁止入库与 RAG |

项目级实施顺序只读取 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)。

## 验证

在本目录执行：

```powershell
.\verify.cmd
```

`verify.cmd` 会执行 I1 静态基线和 I2 编译、OpenAPI、数据库、安全、七工具、输出预算及依赖审计。验证不读取或输出凭据；运行态验证使用 `npm run start:i2`，Harness 仅加入内部 Docker 网络，不发布宿主机端口。公开界面结论以 `tests/conformance/results/` 为准，不从本地文件存在性推断。
