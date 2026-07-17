# 衡准自动化回归测试系统

本目录是项目自有自动化回归系统的唯一产品根目录。复兴银行被测系统仍在本目录之外；HiAgent 是云端目标平台，不在这里复制或部署。

## 当前状态

I1 的单目录产品边界、固定运行时、结构校验、合成一致性服务、OpenAPI 样例、本机 Coze Studio 0.5.1、受控 Docker 网络、最小 Agent、Knowledge Base 和 Workflow 已真实落地。I2 的 TypeScript/Node Harness、SQLite 单库、七工具 OpenAPI、Bearer/allowlist、安全审计、幂等、输出预算和 Artifact 元数据内核也已落地。I3 的历史验收记录包含 SQLite 状态、Playwright Worker、MiMo 兼容网关、门户登录与资料一致性、七工具调用、会话恢复和知识检索。I4 已完成三条确定性案例、三动作窗口、Midscene 原子能力门禁和人工脚本激活门禁；当前 Coze 插件配置发生漂移，平台唯一入口尚未恢复。

I1 仍不能据实标记为完整通过：当前 Coze Studio 公开界面不支持同结构 Skill 包上传；这是已登记的平台差异。I3 的结果文件是历史验收证据，不等同于当前平台配置仍存在。2026-07-17 公开 UI 复核发现资源库没有 Harness 插件，I4 Agent 仅为草稿，因此恢复七工具公开导入和绑定是 I4 当前唯一平台阻塞。

## 目录职责

| 路径 | 职责 | 当前声明 |
|---|---|---|
| `coze/` | 可公开上传或导入的 Skill、插件和界面配置制品 | I1 制品、公开界面配置与 Coze Studio 基线已落地 |
| `harness/` | API、安全、任务、状态机、SQLite 与证据控制层 | I3 执行状态、租约、知识审计和证据闭环已落地 |
| `worker/` | Playwright 正式执行与 Midscene 作者化适配 | I4 三案例 Worker、Midscene 三动作作者化和能力降级路由已落地 |
| `model-gateway/` | MiMo 非流式上游到 Coze OpenAI SSE 的受控兼容层 | 内部网络、Bearer、无宿主端口；不保存领域状态 |
| `runtime/` | 固定 Node、Chromium 与本地依赖 | 已迁移副本，需通过校验 |
| `contracts/` | Harness OpenAPI 与数据契约 | 七工具 OpenAPI 3.0.3 契约已版本化并通过静态导入校验 |
| `tests/` | 单元、契约、集成、E2E 与平台一致性测试 | I2-I4 内核、三案例、作者化、能力门禁及平台一致性结果已落地 |
| `scripts/` | 准备、启动、停止、验证和离线打包入口 | I1-I4 准备、启停、静态与真实运行验证入口已落地 |
| `docs/` | 产品目录内部说明 | 仅辅助设计，不定义项目顺序 |
| `.data/` | SQLite、日志、证据和运行数据 | 本地生成，禁止入库与 RAG |

项目级实施顺序只读取 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)。

## 验证

在本目录执行：

```powershell
.\verify.cmd
```

`verify.cmd` 会执行 I1 静态基线、I2 编译/数据库/安全/输出预算，以及 I3/I4 Worker、三案例、作者化窗口、OpenAPI 和一致性结果校验。I4 真实门户 E2E 使用 `npm run start:i4` 后执行 `npm run verify:i4:live` 与 `npm run verify:i4:authoring`；凭据只从忽略的运行配置解析为别名，脚本不输出原文。公开界面结论以 `tests/conformance/results/` 和当次 UI 复核为准，不从本地文件存在性推断。
