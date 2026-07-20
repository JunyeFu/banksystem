# 衡准自动化回归测试系统

本目录是项目自有自动化回归系统的唯一产品根目录。复兴银行被测系统仍在本目录之外；HiAgent 是云端目标平台，不在这里复制或部署。

## 当前状态

I1 的单目录产品边界、固定运行时、结构校验、合成一致性服务、OpenAPI 样例、本机 Coze Studio 0.5.1、受控 Docker 网络、最小 Agent、Knowledge Base 和 Workflow 已真实落地。I2 的 TypeScript/Node Harness、SQLite 单库、首版七工具 OpenAPI、Bearer/allowlist、安全审计、幂等、输出预算和 Artifact 元数据内核也已落地。I3 完成 SQLite 状态、Playwright Worker、MiMo 兼容网关、门户登录与资料一致性、七工具调用、会话恢复和知识检索。I4 已完成三条确定性案例、三动作窗口、Midscene 原子能力门禁、人工脚本激活门禁以及 Coze 公开界面恢复与发布。

I5 已完成结构化案例导入、七类失败分类、定位器脚本失效诊断、白名单修复候选、隔离 Playwright 验证和人工确认激活。Coze Studio 0.5.1 已仅通过公开界面发布十一工具插件 v0.0.7、I5 Knowledge Base 与主控 Agent；自然语言批准真实改变 SQLite 权威状态，`repair_candidate_get` 回查为 `ACTIVE/version 4`，关联事故为 `RESOLVED/version 4`。使用旧版本的重复批准被 409 安全拒绝，没有发生第二次状态变更。

I8 当前处于实施中。阶段1已完成受控上下文内核；阶段2已完成一句自然语言输入的Flowise Agentflow制品和Harness交接；阶段3已完成migration 011、严格执行计划、10操作有限DSL、确定性Builder、候选版本/Hash/来源链、不可变SQLite记录和Worker白名单执行。真实Flowise 3.0.12 MCP Client已贯通Harness/SQLite且现有4项工具ACTIVE、10项失败关闭；尚未发布运行中Agentflow、完成真实MiMo对话或执行阶段4六次真实Chromium稳定性门禁。

## 目录职责

| 路径 | 职责 | 当前声明 |
|---|---|---|
| `coze/` | 可公开上传或导入的 Skill、插件和界面配置制品 | I5 十一工具、运行知识、主控 Agent、Workflow 与 Skill 已经公开配置并完成真实入口验收 |
| `harness/` | API、安全、任务、状态机、SQLite 与证据控制层 | I5 导入批次、事故、诊断、修复候选、验证和激活决策全部由 SQLite 管理 |
| `worker/` | Playwright 正式执行与 Midscene 作者化适配 | I5 新增隔离修复候选验证；正式回归仍仅执行已验证 Playwright 脚本 |
| `model-gateway/` | MiMo 非流式上游到 Coze OpenAI SSE 的受控兼容层 | 内部网络、Bearer、无宿主端口；不保存领域状态 |
| `runtime/` | 固定 Node、Chromium 与本地依赖 | 已迁移副本，需通过校验 |
| `contracts/` | Harness OpenAPI 与数据契约 | 十一工具 OpenAPI 3.0.3 与内部修复 Worker 契约已版本化并通过静态校验 |
| `tests/` | 单元、契约、集成、E2E 与平台一致性测试 | I2-I5 共 24 项自动测试和 I5 真实浏览器闭环已通过 |
| `scripts/` | 准备、启动、停止、验证和离线打包入口 | I1-I5 准备、启停、静态与真实运行验证入口已落地 |
| `docs/` | 产品目录内部说明 | 仅辅助设计，不定义项目顺序 |
| `.data/` | SQLite、日志、证据和运行数据 | 本地生成，禁止入库与 RAG |

项目级实施顺序只读取 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)。

## 验证

在本目录执行：

```powershell
.\verify.cmd
```

`verify.cmd` 执行 I1-I5 静态与自动测试基线。I5 完整验收执行 `npm run verify:i5`，会进一步运行十一工具契约、Docker/SQLite 迁移、受控定位器失败刺激、真实 Chromium 隔离候选验证、人工决策门禁和激活后正式复跑。凭据只从忽略的运行配置解析为别名，脚本不输出原文。公开界面结论仍只以当次 UI 验收为准，不从本地文件存在性推断。

I8 阶段1执行 `npm.cmd run verify:i8:stage1`，覆盖严格Schema、migration 009、CTX升级、视觉/主控预算、usage超限失败关闭、Worker契约和I4兼容回归。

I8 阶段2执行 `npm.cmd run verify:i8:stage2`，覆盖阶段1回归、migration 010、准备/确认/查询状态、Flowise 3.0.12节点兼容、Agentflow禁止节点、MCP认证、14工具白名单和真实Flowise MCP Client到Harness/SQLite集成。

I8 阶段3执行 `npm.cmd run verify:i8:stage3`，覆盖阶段1/2回归、migration 011、严格执行计划、有限DSL、确定性Builder、来源链/Hash、候选持久化、Flowise `candidate_get` 和Worker篡改/危险能力拒绝。该门禁使用受控Fake Page验证执行契约，不替代阶段4真实Chromium稳定性验证。
