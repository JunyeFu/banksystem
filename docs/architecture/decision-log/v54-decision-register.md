---
id: DOC-80AF07B712
title: V5.4 平台决策登记册
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.4
effective_date: 2026-07-15
owner: project-owner
---

# V5.4 平台决策登记册

状态：已由项目负责人逐组确认。本文只记录已批准的架构选择；不代表平台功能已经实现。

## 2026-07-15 职责边界修订

本节为较新的项目负责人决策，优先于本文后续冲突条目。完整定义和未决事项见 [`../overview/coze-harness-midscene-observability-boundary.md`](../overview/coze-harness-midscene-observability-boundary.md)。

- Coze 自定义 Agent/Workflow 是唯一业务 Agent 编排入口。
- Harness 是本机工具链、上下文控制、安全门禁和执行层，不是第二个业务 Agent 平台。
- Midscene 是接入视觉/多模态模型的视觉操作 Agent；三动作窗口由 Harness 内的外部控制层强制。
- Playwright 承担高风险提交、确定性验证、脚本资产和正式回归。
- 衡准只展示指标和证据，不提供 Agent 支持、案例/知识写入、脚本、基线、调度或恢复控制。
- Codex 只负责开发，不作为演示系统运行时作者化或编排主体。
- 正式定时回归仍只执行已验证 Playwright 脚本，不调用主控 LLM、Midscene 或视觉模型。
- Harness 的 `regression_platform` 数据库是案例、计划、脚本、基线、运行、调度、事故、修复候选、激活决定、审批记录和证据元数据的唯一事实来源。Coze只保存 Agent 配置、会话和 Workflow 编排状态，衡准只读取 Harness 查询模型或观测投影；禁止跨系统双写同一测试领域实体。
- Coze Knowledge Base 是运行时唯一知识权威。仓库 `docs/ + rag/` 仅服务项目开发、审计和Codex维护；运行时不得读取、同步或回退到这些文件。Harness只记录Coze知识版本和检索证据引用，不保存知识正文副本。
- 调度执行由 Harness 持有确定性 Schedule、互斥锁、misfire 与补跑语义；Coze 只经版本化工具创建、查询和停用 Schedule。
- Coze以自托管 Coze Studio 部署；以 HTTP OpenAPI Plugin 调用 Harness，使用服务令牌与内网 allowlist 鉴权。
- 主控、Midscene Grounding、Planning 和 Insight 使用可迁移的双 Profile；默认模型负责 grounding，Planning/Insight 按需启用。外部模型仅接收本机脱敏截图；全封闭内网改用本机视觉模型。
- 修复可自动诊断并在隔离环境验证，但正式脚本激活、Schedule 恢复必须由人在 Coze 中确认。
- 衡准保留所有既有路由，但均迁移为只读观测视图；写操作迁入 Coze 流程。
- 首批导入支持 Playwright、Selenium、Cypress、Postman 和 Gherkin，并提供其他格式的 Adapter SDK；视频只在本机上传、拆帧，Coze只接收 Artifact ID。
- Fixture 隔离强制 `namespace + runId`；Harness以 outbox 向只读衡准投影事件；内网迁移采用含镜像 tar、清单与恢复演练的版本化离线包。
- 新建的 Harness/衡准/回归平台持久化统一使用 SQLite，并需建立独立 v5.4 验收矩阵。SQLite 不替换既有 Fineract/Mifos 或银行渠道的 PostgreSQL 核心依赖。

## 2026-07-16 实习交付优先级修订

项目负责人明确实习交付物只要求自动化回归测试平台。实施顺序只以 [`../../../agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md) 为准，并覆盖本登记册中的旧先后关系：

1. 先保护并冻结当前复兴银行被测基线，不继续扩大银行前端重构范围；
2. Coze 部署、固定运行时、Harness、SQLite、Plugin、Artifact 和 Worker 基础立即开工，可与银行案例修复并行；
3. 银行页面采用案例级门禁：只有某案例接入 Harness 前，才要求该案例经过的页面、API、角色、Fixture 和稳定定位器通过验收；
4. 首批三个低风险案例是客户登录/个人资料一致性、账户列表/详情隔离、安全拒绝与会话恢复；转账、贷款、日终和审批转为后续扩展；
5. 衡准只读观测实现继续暂停，不得占用平台核心资源，也不得成为 Coze/Harness 依赖。

该优先级不改变衡准最终只读定位，也不改变 Coze、Harness、Midscene、Playwright 与 SQLite 的既定边界。`FE-DEFECT-001` 的整体完成不再是平台开工条件。

## 已确认的总体边界

- 银行核心修复与平台基础契约可并行，但平台的正式执行能力必须等待核心稳定。
- 银行核心保留 Java/Spring；回归平台采用独立 TypeScript/Node 服务与 Worker。
- 平台只经 Gateway、正式业务 API 和受控 Test Support API 与银行交互，禁止直写渠道或 Fineract 数据库。
- 平台以本机受管 SQLite 数据库文件 `regression_platform.sqlite` 持久化，并使用独立迁移历史、单写入队列、WAL、外键和完整性校验；数据库文件不入库。
- `regression_platform` 是回归测试领域唯一事实来源；Coze 和衡准不得建立同一业务实体的第二权威副本。
- 平台入口经 Gateway 的 `/quality/`、`/regression/`、`/authoring/` 路径暴露；内部 API 与 Worker 不直接映射宿主机端口。

## 服务、数据与门户

- 第一批服务为 `quality-case-service`、`test-control-service`、`artifact-registry-service`，以及 `validation-playwright-worker`、`scheduled-regression-worker`。
- 平台代码位于独立 `platform/` pnpm workspace；API 使用 Fastify，数据库访问使用 SQLite 驱动与显式 SQL 迁移。
- Case/Baseline 使用不可变版本与 `DRAFT -> REVIEW -> APPROVED -> RETIRED` 生命周期；创建人与批准人必须分离。
- 首批平台表为 Case、CaseVersion、Baseline、BaselineVersion、ValidationRun、RegressionRun、ScriptArtifact、EvidenceObject；后续表按已批准批次追加。
- 原始输入不可变保存，并保存标准化版本和 SHA-256。视频进入异步分析状态，不同步调用视觉模型。
- JSON Schema 是运行时契约事实来源；Fastify/Ajv 校验入站数据，OpenAPI 按服务拆分，公共 Schema 进入共享 contracts 包。
- 衡准门户使用 React/Vite/TypeScript/Ant Design、React Query、React Hook Form、Zod；最终产品仅保留 Case、Source、Video、Baseline、Evidence、Knowledge、运行、事故和修复结果的只读观测投影。全部既有路由保留为只读，写操作迁入 Coze。
- 实习最小闭环先以客户登录/个人资料一致性、账户列表/详情隔离、安全拒绝与会话恢复三条低风险案例验收；内部转账、贷款申请和运营写操作属于后续扩展。

## 证据、Fixture、验证与调度

- Artifact 与 Evidence 保存于受管 Docker Volume，数据库保存元数据、哈希、保留期和下载审计；下载通过鉴权短期 URL。
- Artifact 保留当前已验证版本；Evidence 默认 30 天；运行元数据与审计默认 365 天；清理任务可配置且可审计。
- 每运行使用独立 `namespace/runId`，仅经受控 Seed/Reset 管理 Fixture；禁止直写业务数据库。
- Worker 在隔离容器执行：只读脚本挂载、受控网络、临时目录、无 Agent/平台密钥、任务结束销毁。
- 脚本采用 ZIP + manifest + SHA-256；只允许 Playwright 和批准的内部 helper、批准目标 URL、路径/文件名/大小 allowlist。
- 验证使用全新 BrowserContext、Fixture namespace 和证据目录；认证状态通过受控、短时、加密、审计的 storage state 交付，任务结束删除。
- Baseline 必须比较 URL、语义文本、网络结果和受控业务断言；截图比较为可选项。
- Harness 持有定时回归：五字段 Cron 加显式 IANA 时区；同一 environment + fixture namespace 同时仅允许一个运行，并负责断网重启、misfire 与补跑语义；Coze 只经 Harness 工具创建、查询、停用。
- 失败仅对基础设施瞬时错误重试；业务与 Baseline 失败自动暂停 Schedule、创建 FailureIncident、保留证据，不自动改写脚本。

## Agent 作者阶段与恢复

- Coze Knowledge Base、Agent 和 Workflow负责运行时知识、主控推理与业务编排；仓库 `docs/ + rag/` 不属于交付系统运行时。
- Harness 向 Coze 暴露收敛的任务级工具，执行参数校验、权限、幂等、任务状态、上下文裁剪、安全门禁、浏览器工具和证据采集。
- Midscene 使用可迁移的双模型 Profile：默认视觉模型负责 grounding，Planning 与 Insight 仅在需要时启用；模型标识、Endpoint 与凭据只在运行时注入。
- Midscene 使用全局摘要与 previous/current/next 窗口、单动作预算、ActionEventStore、租约和可重放状态；该控制层属于 Harness，不是 Midscene 原生记忆。高风险动作为 Midscene Locate + Playwright Commit。
- Coze 可编排自然语言、格式化案例、视频案例、失败诊断和语言修复；Harness 只执行结构化任务，不能自行改变业务目标或正式资产。
- 模型不得获得 Shell、SQL、任意 HTTP、文件系统根、浏览器 CDP、Storage State、密钥或银行内部凭据。外部模型仅能接收本机脱敏后的最小截图；全封闭内网必须改用本机视觉模型。
- 修复候选必须隔离执行并独立验证；验证通过后仍必须由人在 Coze 中确认，才可激活正式脚本或恢复 Schedule。

## 权限、审计、工程化与交付

- 在 `bank-internal` Realm 新建平台 Client 与 `TEST_ANALYST`、`BASELINE_APPROVER`、`TEST_DEVELOPER`、`REGRESSION_OPERATOR`、`REGRESSION_AUDITOR`、`RECOVERY_MANAGER` 角色。
- 平台使用独立 append-only 审计链；不写入银行 `security_audit_event`。
- Case Export ZIP 固定 Case/Baseline/知识版本，不含 Token、Storage State、数据库凭据或绝对宿主机路径。
- Coze Knowledge Base 负责运行时知识资产的审核、版本、Hash、来源、范围和失效治理；Harness记录Coze资料集/版本及检索证据引用，不复制知识正文。
- 本机演示使用脱敏数据、独立演示身份、独立数据库和受控 Volume；浏览器、Worker、证据和实际执行动作留在本机。主控与视觉模型仅接收经批准的最小化输入。
- 平台采用精确版本、lockfile、镜像 digest、SBOM、非 root 容器、最小挂载、最小网络与健康检查。
- 迁移以 `platform-migrate` 一次性 Job 执行；SQLite 数据库、Artifact 和 Evidence 分别备份并在临时目标验证。单实例演示只允许一个迁移/写入所有者，升级前执行备份、`integrity_check` 和恢复演练。
- GitHub Actions 执行契约、类型、Lint、单元、SQL migration 和 ZIP 安全检查；浏览器集成测试在受控 Runner 运行。
- 当前脏工作区是受保护基线。每批只暂存明确文件，验证后推送至专用 `agent/v54-*` 分支，不自动 merge 或 force push。
