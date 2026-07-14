# V5.4 平台决策登记册

状态：已由项目负责人逐组确认。本文只记录已批准的架构选择；不代表平台功能已经实现。

## 已确认的总体边界

- 银行核心修复与平台基础契约可并行，但平台的正式执行能力必须等待核心稳定。
- 银行核心保留 Java/Spring；回归平台采用独立 TypeScript/Node 服务与 Worker。
- 平台只经 Gateway、正式业务 API 和受控 Test Support API 与银行交互，禁止直写渠道或 Fineract 数据库。
- 平台在同一 PostgreSQL 实例使用独立 `regression_platform` 数据库、独立账户和独立迁移历史。
- 平台入口经 Gateway 的 `/quality/`、`/regression/`、`/authoring/` 路径暴露；内部 API 与 Worker 不直接映射宿主机端口。

## 服务、数据与门户

- 第一批服务为 `quality-case-service`、`test-control-service`、`artifact-registry-service`，以及 `validation-playwright-worker`、`scheduled-regression-worker`。
- 平台代码位于独立 `platform/` pnpm workspace；API 使用 Fastify，数据库访问使用 `pg` 与显式 SQL 迁移。
- Case/Baseline 使用不可变版本与 `DRAFT -> REVIEW -> APPROVED -> RETIRED` 生命周期；创建人与批准人必须分离。
- 首批平台表为 Case、CaseVersion、Baseline、BaselineVersion、ValidationRun、RegressionRun、ScriptArtifact、EvidenceObject；后续表按已批准批次追加。
- 原始输入不可变保存，并保存标准化版本和 SHA-256。视频进入异步分析状态，不同步调用视觉模型。
- JSON Schema 是运行时契约事实来源；Fastify/Ajv 校验入站数据，OpenAPI 按服务拆分，公共 Schema 进入共享 contracts 包。
- Quality Case Portal 使用 React/Vite/TypeScript/Ant Design、React Query、React Hook Form、Zod；首批覆盖 Case、Source、Video、Baseline、Evidence、Export 与 Knowledge。
- 首批以客户登录/账户查询、内部转账、贷款申请三条真实银行案例验收。

## 证据、Fixture、验证与调度

- Artifact 与 Evidence 保存于受管 Docker Volume，数据库保存元数据、哈希、保留期和下载审计；下载通过鉴权短期 URL。
- Artifact 保留当前已验证版本；Evidence 默认 30 天；运行元数据与审计默认 365 天；清理任务可配置且可审计。
- 每运行使用独立 `namespace/runId`，仅经受控 Seed/Reset 管理 Fixture；禁止直写业务数据库。
- Worker 在隔离容器执行：只读脚本挂载、受控网络、临时目录、无 Agent/平台密钥、任务结束销毁。
- 脚本采用 ZIP + manifest + SHA-256；只允许 Playwright 和批准的内部 helper、批准目标 URL、路径/文件名/大小 allowlist。
- 验证使用全新 BrowserContext、Fixture namespace 和证据目录；认证状态通过受控、短时、加密、审计的 storage state 交付，任务结束删除。
- Baseline 必须比较 URL、语义文本、网络结果和受控业务断言；截图比较为可选项。
- 定时回归使用五字段 Cron 加显式 IANA 时区；同一 environment + fixture namespace 同时仅允许一个运行。
- 失败仅对基础设施瞬时错误重试；业务与 Baseline 失败自动暂停 Schedule、创建 FailureIncident、保留证据，不自动改写脚本。

## AI 作者阶段与恢复

- RAG 只使用审核后的项目知识资产；`regression-knowledge-service` 以 PostgreSQL 全文检索、版本、Hash、审核状态和 Retrieval Snapshot 实现。
- 首批直接接入真实 Coze 与真实 Midscene 视觉模型，但所有 Provider 能力须通过 Secret、健康检查、脱敏、最小 Smoke、工具回调和 Artifact 链路验证。
- Coze 凭据采用 Docker Secret，仅作者服务可读；专用 Regression Authoring Bot 使用受控 Tool Schema。
- 真实截图只可在虚构/脱敏 Fixture、规则脱敏与批准模型前提下发送；未满足条件时作者能力状态为 `PENDING_PROVIDER_VALIDATION`。
- LLM 仅产生 `FullActionPlan` 候选；Plan Harness 与人工确认后才可复刻。风险策略优先于模型，未知动作按 HIGH。
- Midscene 使用全局摘要与 previous/current/next 窗口、单动作预算、ActionEventStore、租约和可重放状态；高风险动作为 Midscene Locate + Playwright Commit。
- 云端 Agent 到本地 Worker 通过 Task Relay + 主动出站 Local Bridge 连接。Agent 不可访问 Shell、SQL、任意 HTTP、文件系统根、浏览器 CDP、Storage State 或密钥。
- 失败恢复仅有“重新录入人工成功案例”与“描述行为变化后重新作者化”两条结构化、可审计路径。

## 权限、审计、工程化与交付

- 在 `bank-internal` Realm 新建平台 Client 与 `TEST_ANALYST`、`BASELINE_APPROVER`、`TEST_DEVELOPER`、`REGRESSION_OPERATOR`、`REGRESSION_AUDITOR`、`RECOVERY_MANAGER` 角色。
- 平台使用独立 append-only 审计链；不写入银行 `security_audit_event`。
- Case Export ZIP 固定 Case/Baseline/知识版本，不含 Token、Storage State、数据库凭据或绝对宿主机路径。
- 知识资产遵循 TEST_DEVELOPER 提交、REGRESSION_AUDITOR 审核、版本/Hash/来源/范围/失效治理。
- 本机外网演示使用脱敏数据、独立演示身份、独立数据库和受控 Volume；确定性平台与 Authoring 使用不同 Compose Overlay。
- 平台采用精确版本、lockfile、镜像 digest、SBOM、非 root 容器、最小挂载、最小网络与健康检查。
- 迁移以 `platform-migrate` 一次性 Job 执行；数据库、Artifact 和 Evidence 分别备份并在临时目标验证。
- GitHub Actions 执行契约、类型、Lint、单元、SQL migration 和 ZIP 安全检查；浏览器集成测试在受控 Runner 运行。
- 当前脏工作区是受保护基线。每批只暂存明确文件，验证后推送至专用 `agent/v54-*` 分支，不自动 merge 或 force push。

## B0 已确认实施参数

- 通过一次性 `platform-db-init` Job 创建 `regression_platform` 数据库、最小权限平台角色和独立 `platform-db-password` Secret。仅该初始化 Job 可读取数据库管理员 Secret；运行时服务不能读取该凭据。
- `platform_owner` 仅用于 migration；API 服务使用 `platform_app`；Worker 按最小所需表授权。
- Keycloak 使用三个 Client：Quality Case Portal 的 Public Client + PKCE，平台 API 的 Confidential Client，以及 Worker 的 Confidential Client + Service Account。
- 受控 `auth-state:create` 只接受 Worker Service Account 调用；使用测试专用合成用户凭据创建一次性、加密、15 分钟过期、单次消费且审计的 storage state 引用，任务结束删除。
- Gateway 平台 API 统一为 `/api/platform/v1/...`；门户路径为 `/quality/` 和 `/quality/login/callback`，预留 `/regression/`、`/authoring/`。
- B0 只创建 pnpm workspace、共享 contracts/config、三个 API 服务和两个 Worker 的配置/健康检查骨架；Case/Baseline 表与业务 API 在 B1 实现。
- 使用 `platform_artifacts`、`platform_evidence`、`platform_runtime` 命名 Volume；Worker 临时目录用 tmpfs。
- `.gitignore` 扩展忽略平台运行产物、`.auth`、Artifact/Evidence/Runtime、报告、视频、截图、构建产物和依赖目录。
- B0 仅建立 Provider Secret 名称、Adapter 接口、健康检查契约和默认关闭状态；真实 Coze/视觉模型凭据与启用测试在 B6。
