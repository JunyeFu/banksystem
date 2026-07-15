# 阶段二：Playwright 脚本资产、独立验证、定时回归与失败事件平台——需求开发一体化方案 v5.4

> 文档版本：5.4.0  
> 所属阶段：Stage 2  
> 前置条件：阶段一可输出 `RegressionCasePackage` 与已审批 `BaselineDefinition`  
> 阶段目标：建设不依赖主控 LLM、视觉 LLM 或 Midscene 的 Playwright 脚本资产、独立验证、调度和正式回归执行平台  
> 核心执行框架：Playwright Test + TypeScript  
> 调度实现：Quartz 持久化调度 + Coze/企业 Agent 原生 Trigger 适配  
> 主要使用者：测试开发、测试经理、调度管理员、环境管理员、审计人员、阶段三脚本生产系统

---

# 0. 阶段定位

阶段二是整个系统的**确定性执行平面**。阶段三可以使用 AI 生成脚本，但任何脚本只有在阶段二完成静态门禁、独立执行和 Baseline 比对后，才能成为正式 `ScriptArtifact`。

阶段二必须保证：

```text
AI 生成阶段可以变化
正式脚本资产不可被静默修改
定时回归不调用任何 LLM
每次运行使用隔离 BrowserContext
每个结果都能追踪到脚本版本、案例版本和 Baseline 版本
失败不会触发未经审批的自动修复
```

阶段二完成后，应形成以下闭环：

```text
PlaywrightScriptPackage
→ Package Integrity
→ Static Validation
→ Independent Validation Run
→ Baseline Comparison
→ Human Approval
→ ScriptArtifact
→ RegressionSchedule
→ RegressionRun
→ Evidence / Audit / Notification
```

---

# 1. 业务需求

## 1.1 主要用户故事

### US-S2-001 导入脚本包

作为 TEST_DEVELOPER，我希望导入阶段三生成的 Playwright 脚本包，以便平台执行完整性和安全检查。

验收：

```text
Given 上传文件为允许的 ZIP 包
When 平台完成解压前检查、Manifest 校验和文件 Hash 校验
Then 生成 scriptPackageId
And 状态为 PACKAGE_UPLOADED
And 不执行包内任何代码
```

### US-S2-002 静态验证

作为 TEST_DEVELOPER，我希望平台对脚本进行 TypeScript、ESLint、AST、安全、Locator 和 Fixture 检查，以便在真实浏览器执行前阻止危险或低质量代码。

### US-S2-003 独立验证

作为 TEST_DEVELOPER，我希望脚本在与 Midscene 复刻完全隔离的 Runner 中执行，以便确认脚本不是依赖复刻残留状态而通过。

### US-S2-004 Baseline 比较

作为 TEST_ANALYST，我希望系统将脚本执行结果与人工成功案例 Baseline 比较，以便确认脚本真正复现业务成功结果。

### US-S2-005 注册正式脚本

作为 TEST_MANAGER，我希望审批已通过验证的脚本版本，使其成为可用于定时回归的 `ScriptArtifact`。

### US-S2-006 创建定时回归

作为 SCHEDULE_OPERATOR，我希望按每周、每月、一次性或 Cron 创建回归计划，并明确时区、Cron 方言、环境和数据集。

### US-S2-007 防止任务重叠

作为 ENVIRONMENT_OPERATOR，我希望同一环境、同一资源锁或同一计划的运行不会非法重叠。

### US-S2-008 查看实时运行

作为 TEST_ANALYST，我希望看到 Run、Case、Step、证据和 Baseline 比较的实时状态。

### US-S2-009 失败分类

作为 TEST_DEVELOPER，我希望系统区分产品失败、脚本失败、环境失败、数据失败和 Baseline 漂移，以便采取正确动作。

### US-S2-010 终态失败主动提醒

作为 Schedule Owner，当定时/周期任务进入终态失败时，我必须在 HiAgent/Coze 对话中收到主动提醒；平台支持时，也可以同时收到系统通知、弹窗或企业 IM。

验收：

```text
[ ] Run 终态与 Incident/Outbox 同事务
[ ] Schedule 自动暂停
[ ] Agent Conversation 是强制通知渠道
[ ] 通知包含失败摘要、证据入口和两条恢复路径
[ ] 同一 Run 不重复投递相同通知
[ ] Agent 不可用时进入备用通知和 Dead Letter
```

### US-S2-013 选择两条恢复路径

Agent 只能提供：

```text
ABANDON_AND_REENTER_SUCCESS_CASE
DESCRIBE_CHANGE_AND_REAUTHOR
```

用户选择必须持久化为 `RecoveryDecision`，并写入审计。

### US-S2-014 路径一放弃脚本

用户选择路径一后：

```text
ScriptArtifact → ABANDONED_AFTER_FAILURE
Schedule → PAUSED_WAITING_USER_RECOVERY
Incident → RECOVERY_IN_PROGRESS
```

系统等待阶段一接收新的人工成功案例。

### US-S2-015 路径二变化描述重新生产

用户选择路径二并提交自然语言变化描述后，阶段二创建 `ReauthoringSession` 并调用阶段三；正式 ScriptArtifact 不得被直接编辑。

### US-S2-016 恢复 Schedule

新 ScriptArtifact 通过独立验证后，用户可以：

```text
仅输出脚本
替换原 Schedule 中的 ScriptArtifact 并恢复
创建新 Schedule
```

---


### US-S2-011 审核动作风险摘要

作为 TEST_MANAGER，我需要查看脚本包中每个高风险动作的来源、执行证据和验证结果，确保只有经过 Playwright Commit 路径验证的高风险动作可以注册。

验收：

```text
每个 HIGH 动作关联 ActionRiskAssessment
每个 HIGH 动作关联 PlaywrightExecutionEvidence
高风险动作若由 MIDSCENE_DIRECT 执行则拒绝注册
高风险脚本需要 Maker-Checker
```

### US-S2-012 查看结构化错误原因

作为 TEST_ANALYST，我需要在验证或定时回归失败后看到标准错误码、根因分类、受影响步骤、证据和建议操作。


# 2. 功能范围

## 2.1 Regression Test Portal

路由：

```text
/login
/dashboard
/script-packages
/script-packages/{scriptPackageId}
/script-packages/{scriptPackageId}/files
/script-packages/{scriptPackageId}/static-validation
/script-packages/{scriptPackageId}/validation-runs
/scripts
/scripts/{scriptArtifactId}
/scripts/{scriptArtifactId}/versions/{version}
/baselines
/baselines/{baselineId}
/schedules
/schedules/new
/schedules/{scheduleId}
/runs
/runs/{regressionRunId}
/runs/{regressionRunId}/steps
/runs/{regressionRunId}/comparison
/evidence
/evidence/{evidenceId}
/environments
/environment-locks
/approvals
/reauthoring-requests
/audit
/settings
```

页面能力：

| 页面 | 必须能力 |
|---|---|
| Dashboard | 今日运行、通过率、失败分类、Worker 心跳、调度延迟、待审批 |
| Script Packages | 上传、完整性、文件树、Hash、来源、门禁状态 |
| Static Validation | TypeScript、ESLint、AST、Secret、Locator、Manifest 结果 |
| Validation Runs | 独立执行、Trace、截图、视频、Baseline 比较 |
| Scripts | 正式资产、版本、状态、关联 Case/Baseline、下载 |
| Schedules | 周/月/Cron、方言、时区、Misfire、重叠策略、启停 |
| Runs | 状态时间线、实时步骤、环境锁、失败分类、证据 |
| Baselines | Case Version、强制条件、可选截图、版本和审批 |
| Reauthoring | 失败证据、原因、目标脚本、人工决策 |
| Audit | Actor、Action、Object、Before/After、Hash Chain |

## 2.2 阶段二模块

```text
Script Package Intake
Package Security Scanner
Static Validation Service
Script Artifact Registry
Independent Validation Orchestrator
Playwright Runner Pool
Baseline Comparator
Environment Registry
Environment Lock Service
Schedule Registry
Quartz Scheduler Adapter
Agent Trigger Adapter
Regression Run Orchestrator
Evidence Service
Notification Service
Approval Service
Reauthoring Service
Audit Service
```

---

# 3. 状态机

## 3.1 PlaywrightScriptPackage 状态

```text
PACKAGE_UPLOADED
→ INTEGRITY_VALIDATING
→ INTEGRITY_VALIDATED
→ STATIC_VALIDATING
→ STATIC_VALIDATED
→ VALIDATION_QUEUED
→ VALIDATION_RUNNING
→ INDEPENDENT_RUN_PASSED
→ BASELINE_MATCHED
→ WAITING_APPROVAL
→ SCRIPT_VALIDATED
→ REGISTERED
```

失败状态：

```text
PACKAGE_REJECTED
INTEGRITY_FAILED
STATIC_VALIDATION_FAILED
INDEPENDENT_RUN_FAILED
BASELINE_MISMATCHED
APPROVAL_REJECTED
SECURITY_BLOCKED
EXPIRED
```

规则：

- `SCRIPT_VALIDATED` 之前不得创建正式 Schedule。
- 任意文件变化必须创建新 Package Version。
- 人工修改脚本后必须重新执行全部门禁。
- `REGISTERED` 资产不可在线直接编辑。

## 3.2 RegressionSchedule 状态

```text
DRAFT
→ WAITING_APPROVAL
→ ACTIVE
→ PAUSED
→ ACTIVE
→ DISABLED
```

异常：

```text
INVALID_CRON
INVALID_TIMEZONE
SCRIPT_NOT_VALIDATED
ENVIRONMENT_NOT_AVAILABLE
APPROVAL_REJECTED
```

## 3.3 RegressionRun 状态

```text
CREATED
→ QUEUED
→ ACQUIRING_LOCKS
→ PREPARING
→ RUNNING
→ COMPARING_BASELINE
→ PASSED | FAILED | TIMED_OUT | CANCELLED | SYSTEM_ERROR
```

运行结束后可附加：

```text
FAILURE_CLASSIFIED
REAUTHORING_REQUESTED
NOTIFICATION_SENT
```

---

## 3.4 RegressionFailureIncident 状态

```text
OPEN
→ NOTIFICATION_PENDING
→ NOTIFIED
→ WAITING_USER_RECOVERY_DECISION
→ RECOVERY_IN_PROGRESS
→ RESOLVED | CLOSED_WITHOUT_RECOVERY
```

## 3.5 NotificationDelivery 状态

```text
PENDING
→ CLAIMED
→ SENDING
→ DELIVERED
   | RETRY_WAITING
   | FAILED
   | DEAD_LETTERED
```

## 3.6 Schedule 失败暂停状态

```text
ACTIVE
→ TRIGGERED
→ RUN_FAILED
→ PAUSED_WAITING_USER_RECOVERY
→ ACTIVE | DISABLED
```

`PAUSED_WAITING_USER_RECOVERY` 期间不得创建新的周期 Run。

# 4. 核心领域合同

## 4.1 PlaywrightScriptPackageManifest

文件名：`manifest.json`

```ts
export type ScriptPackageStatus =
  | 'PACKAGE_UPLOADED'
  | 'INTEGRITY_VALIDATED'
  | 'STATIC_VALIDATED'
  | 'INDEPENDENT_RUN_PASSED'
  | 'BASELINE_MATCHED'
  | 'SCRIPT_VALIDATED'
  | 'REGISTERED';

export interface PackageFileEntry {
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
}

export interface PlaywrightScriptPackageManifest {
  schemaVersion: '1.0';
  scriptPackageId: string;
  caseId: string;
  caseVersionId: string;
  baselineId: string;
  generatedAt: string;
  generatedBy: {
    authoringGoalId: string;
    modelId: string;
    promptVersion: string;
  };
  runtime: {
    framework: 'PLAYWRIGHT_TEST';
    language: 'TYPESCRIPT';
    entrySpec: string;
    nodeMajor: number;
    playwrightVersion: string;
    browserProfileRef: string;
  };
  fixtureProfileRef: string;
  environmentAllowlist: string[];
  files: PackageFileEntry[];
}
```

约束：

```text
entrySpec 必须位于 tests/ 下
relativePath 不得为绝对路径
路径不得包含 ..
文件不得为符号链接
Manifest 中每个文件必须存在
包中每个业务文件必须被 Manifest 声明
sha256 必须与实际内容一致
```

## 4.2 ScriptArtifact

```ts
export interface ScriptArtifact {
  scriptArtifactId: string;
  scriptPackageId: string;
  caseId: string;
  caseVersionId: string;
  baselineId: string;
  version: string;
  status: 'SCRIPT_VALIDATED' | 'REGISTERED' | 'DEPRECATED' | 'REVOKED';
  entrySpec: string;
  packageStorageUri: string;
  packageSha256: string;
  requiredEnvironmentRefs: string[];
  fixtureProfileRef: string;
  browserProfileRef: string;
  approvedBy: string;
  approvedAt: string;
}
```


## 4.2A ActionRiskManifest

```ts
export interface ActionRiskManifestEntry {
  readonly stepId: string;
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly executionPolicy:
    | 'MIDSCENE_DIRECT'
    | 'MIDSCENE_DIRECT_WITH_STRICT_VERIFY'
    | 'MIDSCENE_LOCATE_PLAYWRIGHT_COMMIT';
  readonly reasonCodes: readonly string[];
  readonly playwrightCommitEvidenceRef: string | null;
}

export interface ActionRiskManifest {
  readonly policyVersion: string;
  readonly entries: readonly ActionRiskManifestEntry[];
  readonly highRiskActionCount: number;
}
```

注册门禁：

```text
HIGH + MIDSCENE_DIRECT
→ REJECTED

HIGH + 无 Playwright Commit Evidence
→ REJECTED

HIGH + 无人工审批
→ 不允许激活定时任务
```


## 4.3 ScriptValidationRequest

```ts
export interface ScriptValidationRequest {
  validationRunId: string;
  scriptPackageId: string;
  caseId: string;
  caseVersionId: string;
  baselineId: string;
  environmentRef: string;
  fixtureProfileRef: string;
  browserProfileRef: string;
  timeoutMs: number;
  evidencePolicy: {
    trace: 'ON' | 'RETAIN_ON_FAILURE';
    screenshot: 'ONLY_ON_FAILURE' | 'ON';
    video: 'OFF' | 'RETAIN_ON_FAILURE' | 'ON';
  };
}
```

## 4.4 ScriptValidationResult

```ts
export interface ScriptValidationResult {
  validationRunId: string;
  status:
    | 'PASSED'
    | 'FAILED'
    | 'TIMED_OUT'
    | 'SECURITY_BLOCKED'
    | 'SYSTEM_ERROR';
  checks: {
    integrity: 'PASSED' | 'FAILED';
    typescript: 'PASSED' | 'FAILED';
    eslint: 'PASSED' | 'FAILED';
    astSecurity: 'PASSED' | 'FAILED';
    secretScan: 'PASSED' | 'FAILED';
    locatorQuality: 'PASSED' | 'FAILED';
    independentRun: 'PASSED' | 'FAILED';
    baselineComparison: 'PASSED' | 'FAILED';
  };
  regressionRunId?: string;
  comparisonId?: string;
  evidenceIds: string[];
  errorCode?: string;
  errorSummary?: string;
  startedAt: string;
  finishedAt: string;
}
```

## 4.5 BaselineComparisonResult

```ts
export interface BaselineCheckResult {
  checkId: string;
  type:
    | 'VISIBLE_TEXT'
    | 'URL_PATTERN'
    | 'OUTPUT_FIELD'
    | 'NETWORK_EVENT'
    | 'BUSINESS_STATE'
    | 'SCREENSHOT';
  required: boolean;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  expected: unknown;
  actual: unknown;
  evidenceId?: string;
}

export interface BaselineComparisonResult {
  comparisonId: string;
  baselineId: string;
  regressionRunId: string;
  status: 'BASELINE_MATCHED' | 'BASELINE_MISMATCHED';
  checks: BaselineCheckResult[];
  requiredPassed: number;
  requiredTotal: number;
  optionalPassed: number;
  optionalTotal: number;
  createdAt: string;
}
```

## 4.6 RegressionSchedule

```ts
export type CronDialect =
  | 'COZE_SIX_FIELD'
  | 'QUARTZ'
  | 'INTERNAL_NORMALIZED';

export type MisfirePolicy =
  | 'DO_NOT_CATCH_UP'
  | 'FIRE_ONCE_NOW'
  | 'CATCH_UP_WITH_LIMIT';

export interface RegressionSchedule {
  scheduleId: string;
  name: string;
  scriptArtifactId: string;
  caseId: string;
  environmentRef: string;
  fixtureProfileRef: string;
  triggerType: 'CRON' | 'ONE_TIME' | 'MANUAL_ONLY';
  cronDialect?: CronDialect;
  cronExpression?: string;
  oneTimeAt?: string;
  timezone: string;
  misfirePolicy: MisfirePolicy;
  catchUpLimit?: number;
  concurrencyPolicy: 'FORBID_OVERLAP' | 'ALLOW_OVERLAP';
  enabled: boolean;
  notificationProfileRef: string;
}
```

示例：

```json
{
  "scheduleId": "SCH-PAY-001",
  "name": "每周三支付回归",
  "scriptArtifactId": "SCRIPT-PAY-001",
  "caseId": "REG-PAY-001",
  "environmentRef": "SIT",
  "fixtureProfileRef": "PAYMENT_STANDARD",
  "triggerType": "CRON",
  "cronDialect": "QUARTZ",
  "cronExpression": "0 0 9 ? * WED",
  "timezone": "Asia/Shanghai",
  "misfirePolicy": "DO_NOT_CATCH_UP",
  "concurrencyPolicy": "FORBID_OVERLAP",
  "enabled": true,
  "notificationProfileRef": "QA_DEFAULT"
}
```

## 4.7 RegressionRunTask

```ts
export interface RegressionRunTask {
  schemaVersion: '1.0';
  regressionRunId: string;
  scheduleId?: string;
  triggerSource: 'SCHEDULE' | 'MANUAL' | 'VALIDATION';
  scriptArtifactId: string;
  caseId: string;
  baselineId: string;
  environmentRef: string;
  fixtureProfileRef: string;
  browserProfileRef: string;
  idempotencyKey: string;
  requestedAt: string;
  expiresAt: string;
}
```

---


## 4.8 FailureExplanation

```ts
export interface FailureExplanation {
  readonly failureStage:
    | 'PACKAGE'
    | 'STATIC_VALIDATION'
    | 'RUNNER_PREPARATION'
    | 'PLAYWRIGHT_EXECUTION'
    | 'BASELINE_COMPARISON'
    | 'SCHEDULE_TRIGGER'
    | 'ENVIRONMENT'
    | 'FIXTURE';
  readonly errorCode: string;
  readonly rootCauseCategory: string;
  readonly humanReadableReason: string;
  readonly affectedStepId: string | null;
  readonly retryable: boolean;
  readonly evidenceRefs: readonly string[];
  readonly recommendedAction: string;
}
```

`FailureClassifier` 必须先生成机器分类，再由 `FailureExplanationService` 生成面向用户的说明。LLM 可以用于改善表述，但不得改变错误码、根因分类和证据引用。


## 4.9 RegressionFailureIncident

```ts
export interface RegressionFailureIncident {
  readonly incidentId: string;
  readonly regressionRunId: string;
  readonly scheduleId: string | null;
  readonly scriptArtifactId: string;
  readonly caseId: string;
  readonly failureCategory: FailureCategory;
  readonly failureExplanationId: string;
  readonly status:
    | 'OPEN'
    | 'NOTIFICATION_PENDING'
    | 'NOTIFIED'
    | 'WAITING_USER_RECOVERY_DECISION'
    | 'RECOVERY_IN_PROGRESS'
    | 'RESOLVED'
    | 'CLOSED_WITHOUT_RECOVERY';
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly version: number;
}
```

## 4.10 AgentConversationBinding

```ts
export interface AgentConversationBinding {
  readonly bindingId: string;
  readonly platform: 'HIAGENT' | 'COZE' | 'ENTERPRISE_AGENT';
  readonly agentId: string;
  readonly ownerUserId: string;
  readonly conversationId: string | null;
  readonly notificationInboxRef: string | null;
  readonly enabledChannels: readonly NotificationChannel[];
  readonly timezone: string;
  readonly locale: string;
  readonly active: boolean;
}
```

## 4.11 AgentFailureNotification

```ts
export type NotificationChannel =
  | 'AGENT_CONVERSATION'
  | 'AGENT_NOTIFICATION_INBOX'
  | 'WEB_PUSH'
  | 'DESKTOP_TOAST'
  | 'ENTERPRISE_IM'
  | 'EMAIL';

export interface AgentFailureNotification {
  readonly notificationId: string;
  readonly incidentId: string;
  readonly idempotencyKey: string;
  readonly title: string;
  readonly summary: string;
  readonly failureCategory: FailureCategory;
  readonly failedStepName: string | null;
  readonly scriptArtifactId: string;
  readonly scheduleId: string | null;
  readonly recoveryOptions: readonly [
    'ABANDON_AND_REENTER_SUCCESS_CASE',
    'DESCRIBE_CHANGE_AND_REAUTHOR'
  ];
  readonly evidenceDeepLink: string;
}
```

## 4.12 RecoveryDecision

```ts
export type RecoveryOption =
  | 'ABANDON_AND_REENTER_SUCCESS_CASE'
  | 'DESCRIBE_CHANGE_AND_REAUTHOR';

export interface RecoveryDecision {
  readonly decisionId: string;
  readonly incidentId: string;
  readonly option: RecoveryOption;
  readonly selectedBy: string;
  readonly selectedAt: string;
  readonly naturalLanguageChangeDescription: string | null;
}
```

## 4.13 ReauthoringSession

```ts
export interface ReauthoringSession {
  readonly reauthoringSessionId: string;
  readonly incidentId: string;
  readonly recoveryOption: RecoveryOption;
  readonly oldScriptArtifactId: string;
  readonly status:
    | 'WAITING_NEW_SUCCESS_CASE'
    | 'WAITING_CHANGE_DESCRIPTION'
    | 'SENT_TO_AUTHORING'
    | 'AUTHORING_RUNNING'
    | 'NEW_SCRIPT_VALIDATED'
    | 'WAITING_DELIVERY_DECISION'
    | 'RESOLVED';
  readonly newScriptArtifactId: string | null;
}
```

# 5. 系统架构

## 5.1 Container

```text
Browser
└─ Regression Test Portal
       │ REST + SSE
       ▼
Test Control Service
├─ ScriptPackageApplicationService
├─ StaticValidationApplicationService
├─ ScriptArtifactApplicationService
├─ ValidationRunApplicationService
├─ ScheduleApplicationService
├─ RegressionRunApplicationService
├─ ApprovalApplicationService
├─ EnvironmentLockApplicationService
├─ ReauthoringApplicationService
└─ AuditApplicationService
       │
       ├─ PostgreSQL
       ├─ ActiveMQ / Internal Queue
       ├─ Quartz JDBC JobStore
       └─ Artifact Storage
                │
                ├─ Validation Playwright Worker
                └─ Scheduled Regression Worker
```

## 5.2 Trust Boundary

```text
Portal User Boundary
→ Test Control API Boundary
→ Queue Boundary
→ Runner Sandbox Boundary
→ Test Environment Boundary
→ Artifact Boundary
```

Runner Sandbox 禁止：

```text
访问 Test Control 数据库
访问 Artifact 存储根凭据
访问非 Allowlist URL
启动 Shell
执行任意用户命令
写入项目外路径
读取其他 Run 的 Storage State
```

---

## 5.3 V5.4 失败通知与恢复容器

```text
Regression Run Service
→ Failure Incident Service
→ Notification Outbox
→ Failure Notification Worker
→ AgentPlatformNotificationPort
→ HiAgent/Coze Adapter
→ Optional SystemNotificationPort

Recovery Decision API
→ Failure Recovery Coordinator
→ Reauthoring Session
→ Stage 1 / Stage 3
```

新增组件：

```text
services/test-control-service/modules/failure-incident
services/test-control-service/modules/failure-notification
services/test-control-service/modules/recovery-decision
workers/failure-notification-worker
packages/agent-notification-contracts
packages/reverse-recovery-contracts
packages/notification-outbox
```

# 6. 工程结构

```text
apps/
└─ regression-test-portal/
   └─ src/
      ├─ app/
      ├─ routes/
      ├─ pages/
      ├─ features/
      │  ├─ script-package/
      │  ├─ static-validation/
      │  ├─ script-artifact/
      │  ├─ validation-run/
      │  ├─ baseline/
      │  ├─ schedule/
      │  ├─ regression-run/
      │  ├─ environment/
      │  ├─ approval/
      │  ├─ evidence/
      │  └─ audit/
      ├─ api/
      ├─ components/
      └─ tests/

services/
└─ test-control-service/
   └─ src/main/java/cn/company/regression/
      ├─ scriptpackage/
      ├─ scriptartifact/
      ├─ validation/
      ├─ baseline/
      ├─ schedule/
      ├─ run/
      ├─ environment/
      ├─ approval/
      ├─ reauthoring/
      ├─ evidence/
      └─ audit/

workers/
├─ validation-playwright-worker/
│  └─ src/
│     ├─ consumer/
│     ├─ workspace/
│     ├─ validator/
│     ├─ runner/
│     ├─ evidence/
│     └─ reporter/
└─ scheduled-regression-worker/
   └─ src/
      ├─ consumer/
      ├─ artifact/
      ├─ fixture/
      ├─ runner/
      ├─ comparator/
      └─ reporter/

packages/
├─ script-artifact-contracts/
├─ script-package-security/
├─ playwright-static-validator/
├─ baseline-comparator/
├─ scheduler-contracts/
├─ regression-reporter/
├─ environment-client/
└─ artifact-client/
```

---

# 7. API 设计

## 7.1 Script Package

```text
POST /api/v1/script-packages
GET  /api/v1/script-packages
GET  /api/v1/script-packages/{scriptPackageId}
GET  /api/v1/script-packages/{scriptPackageId}/files
POST /api/v1/script-packages/{scriptPackageId}:validate-static
POST /api/v1/script-packages/{scriptPackageId}:validate-runtime
POST /api/v1/script-packages/{scriptPackageId}:request-approval
```

## 7.2 Script Artifact

```text
GET  /api/v1/script-artifacts
GET  /api/v1/script-artifacts/{scriptArtifactId}
GET  /api/v1/script-artifacts/{scriptArtifactId}/versions
POST /api/v1/script-artifacts/{scriptArtifactId}:deprecate
POST /api/v1/script-artifacts/{scriptArtifactId}:revoke
GET  /api/v1/script-artifacts/{scriptArtifactId}/download
```

## 7.3 Validation

```text
GET  /api/v1/validation-runs/{validationRunId}
GET  /api/v1/validation-runs/{validationRunId}/events
POST /api/v1/validation-runs/{validationRunId}:cancel
GET  /api/v1/validation-runs/{validationRunId}/comparison
```

## 7.4 Schedule

```text
POST /api/v1/regression-schedules
GET  /api/v1/regression-schedules
GET  /api/v1/regression-schedules/{scheduleId}
PUT  /api/v1/regression-schedules/{scheduleId}
POST /api/v1/regression-schedules/{scheduleId}:activate
POST /api/v1/regression-schedules/{scheduleId}:pause
POST /api/v1/regression-schedules/{scheduleId}:disable
POST /api/v1/regression-schedules/{scheduleId}:run-now
GET  /api/v1/regression-schedules/{scheduleId}/next-fire-times
```

## 7.5 Run

```text
POST /api/v1/regression-runs
GET  /api/v1/regression-runs
GET  /api/v1/regression-runs/{regressionRunId}
GET  /api/v1/regression-runs/{regressionRunId}/events
POST /api/v1/regression-runs/{regressionRunId}:cancel
POST /api/v1/regression-runs/{regressionRunId}:classify
POST /api/v1/regression-runs/{regressionRunId}:request-reauthoring
```

## 7.6 Worker Internal API

```text
POST /internal/api/v1/workers:heartbeat
POST /internal/api/v1/run-events
POST /internal/api/v1/evidence
POST /internal/api/v1/validation-results
POST /internal/api/v1/regression-results
```

所有内部请求必须包含：

```text
X-Worker-Id
X-Request-Id
X-Correlation-Id
X-Message-Id
X-Signature
```

---


## 7.7 Risk and Failure API

```text
GET /api/v1/script-artifacts/{artifactId}/risk-manifest
POST /api/v1/script-packages/{packageId}:review-risk
GET /api/v1/validation-runs/{validationRunId}/failure-explanation
GET /api/v1/regression-runs/{regressionRunId}/failure-explanation
```


## 7.8 Failure Incident API

```text
GET  /api/v1/failure-incidents
GET  /api/v1/failure-incidents/{incidentId}
GET  /api/v1/failure-incidents/{incidentId}/timeline

POST /api/v1/failure-incidents/{incidentId}:select-abandon
POST /api/v1/failure-incidents/{incidentId}:select-describe-change
POST /api/v1/failure-incidents/{incidentId}:close-without-recovery
```

路径二请求：

```json
{
  "description": "确认按钮改为提交，并新增短信验证码步骤",
  "evidenceRefs": [
    "artifact://CHANGE-EVIDENCE-001"
  ]
}
```

## 7.9 Agent Notification API

```text
PUT  /api/v1/users/{userId}/agent-conversation-binding
GET  /api/v1/users/{userId}/agent-conversation-binding

GET  /api/v1/failure-notifications
POST /api/v1/failure-notifications/{notificationId}:retry
POST /api/v1/failure-notifications/{notificationId}:acknowledge

POST /internal/api/v1/notification-delivery-events
```

## 7.10 Schedule Recovery API

```text
POST /api/v1/schedules/{scheduleId}:replace-script
POST /api/v1/schedules/{scheduleId}:resume-after-recovery
GET  /api/v1/schedules/{scheduleId}/recovery-history
```

替换脚本必须验证：

```text
新 ScriptArtifact = SCRIPT_VALIDATED
Incident = RESOLVED 或即将原子解决
User 拥有 schedule:recover 权限
Baseline 和 Environment 兼容
```

# 8. 数据库设计

## 8.1 Script Package

```sql
CREATE TABLE script_package (
    id UUID PRIMARY KEY,
    package_code VARCHAR(128) NOT NULL UNIQUE,
    case_id VARCHAR(128) NOT NULL,
    case_version_id VARCHAR(128) NOT NULL,
    baseline_id VARCHAR(128) NOT NULL,
    version VARCHAR(32) NOT NULL,
    manifest_json JSONB NOT NULL,
    package_storage_uri VARCHAR(1024) NOT NULL,
    package_sha256 CHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    authoring_goal_id VARCHAR(128),
    uploaded_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lock_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_script_package_case_version
      UNIQUE(case_id, case_version_id, version)
);
```

```sql
CREATE TABLE script_package_file (
    id UUID PRIMARY KEY,
    script_package_id UUID NOT NULL REFERENCES script_package(id),
    relative_path VARCHAR(1024) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    content_type VARCHAR(128) NOT NULL,
    storage_uri VARCHAR(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_script_package_file
      UNIQUE(script_package_id, relative_path)
);
```

## 8.2 Validation

```sql
CREATE TABLE script_validation_run (
    id UUID PRIMARY KEY,
    validation_run_code VARCHAR(128) NOT NULL UNIQUE,
    script_package_id UUID NOT NULL REFERENCES script_package(id),
    environment_ref VARCHAR(128) NOT NULL,
    fixture_profile_ref VARCHAR(128) NOT NULL,
    browser_profile_ref VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL,
    checks_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code VARCHAR(128),
    error_summary TEXT,
    worker_id VARCHAR(128),
    correlation_id VARCHAR(128) NOT NULL,
    requested_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    lock_version BIGINT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE baseline_comparison (
    id UUID PRIMARY KEY,
    comparison_code VARCHAR(128) NOT NULL UNIQUE,
    validation_run_id UUID REFERENCES script_validation_run(id),
    regression_run_id UUID,
    baseline_id VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL,
    result_json JSONB NOT NULL,
    result_sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 8.3 Script Artifact

```sql
CREATE TABLE script_artifact (
    id UUID PRIMARY KEY,
    artifact_code VARCHAR(128) NOT NULL,
    version VARCHAR(32) NOT NULL,
    script_package_id UUID NOT NULL REFERENCES script_package(id),
    case_id VARCHAR(128) NOT NULL,
    case_version_id VARCHAR(128) NOT NULL,
    baseline_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    entry_spec VARCHAR(1024) NOT NULL,
    package_storage_uri VARCHAR(1024) NOT NULL,
    package_sha256 CHAR(64) NOT NULL,
    fixture_profile_ref VARCHAR(128) NOT NULL,
    browser_profile_ref VARCHAR(128) NOT NULL,
    approved_by VARCHAR(128) NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_script_artifact_version UNIQUE(artifact_code, version)
);
```

## 8.4 Schedule

```sql
CREATE TABLE regression_schedule (
    id UUID PRIMARY KEY,
    schedule_code VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    script_artifact_id UUID NOT NULL REFERENCES script_artifact(id),
    case_id VARCHAR(128) NOT NULL,
    environment_ref VARCHAR(128) NOT NULL,
    fixture_profile_ref VARCHAR(128) NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    cron_dialect VARCHAR(32),
    cron_expression VARCHAR(255),
    one_time_at TIMESTAMPTZ,
    timezone VARCHAR(128) NOT NULL,
    misfire_policy VARCHAR(32) NOT NULL,
    catch_up_limit INTEGER,
    concurrency_policy VARCHAR(32) NOT NULL,
    notification_profile_ref VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    requested_by VARCHAR(128) NOT NULL,
    approved_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lock_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_schedule_trigger CHECK (
      (trigger_type = 'CRON' AND cron_expression IS NOT NULL AND cron_dialect IS NOT NULL)
      OR (trigger_type = 'ONE_TIME' AND one_time_at IS NOT NULL)
      OR (trigger_type = 'MANUAL_ONLY')
    )
);
```

## 8.5 Regression Run

```sql
CREATE TABLE regression_run (
    id UUID PRIMARY KEY,
    run_code VARCHAR(128) NOT NULL UNIQUE,
    schedule_id UUID REFERENCES regression_schedule(id),
    script_artifact_id UUID NOT NULL REFERENCES script_artifact(id),
    case_id VARCHAR(128) NOT NULL,
    baseline_id VARCHAR(128) NOT NULL,
    trigger_source VARCHAR(32) NOT NULL,
    environment_ref VARCHAR(128) NOT NULL,
    fixture_profile_ref VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL,
    failure_category VARCHAR(64),
    failure_code VARCHAR(128),
    failure_summary TEXT,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    correlation_id VARCHAR(128) NOT NULL,
    worker_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    queued_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    lock_version BIGINT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE regression_run_event (
    id BIGSERIAL PRIMARY KEY,
    regression_run_id UUID NOT NULL REFERENCES regression_run(id),
    sequence BIGINT NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload_json JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_run_event_sequence UNIQUE(regression_run_id, sequence)
);
```

## 8.6 Reauthoring

```sql
CREATE TABLE reauthoring_request (
    id UUID PRIMARY KEY,
    request_code VARCHAR(128) NOT NULL UNIQUE,
    regression_run_id UUID NOT NULL REFERENCES regression_run(id),
    script_artifact_id UUID NOT NULL REFERENCES script_artifact(id),
    case_id VARCHAR(128) NOT NULL,
    reason_category VARCHAR(64) NOT NULL,
    reason_summary TEXT NOT NULL,
    evidence_refs JSONB NOT NULL,
    status VARCHAR(32) NOT NULL,
    requested_by VARCHAR(128) NOT NULL,
    decided_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
);
```

---


## 8.7 Risk Manifest and Failure Explanation

```sql
CREATE TABLE script_action_risk (
    id UUID PRIMARY KEY,
    script_package_id UUID NOT NULL REFERENCES script_package(id),
    step_id VARCHAR(128) NOT NULL,
    risk_level VARCHAR(16) NOT NULL,
    execution_policy VARCHAR(64) NOT NULL,
    reason_codes JSONB NOT NULL,
    commit_evidence_uri VARCHAR(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_script_action_risk UNIQUE(script_package_id, step_id)
);

CREATE TABLE run_failure_explanation (
    id UUID PRIMARY KEY,
    run_type VARCHAR(32) NOT NULL,
    run_id UUID NOT NULL,
    failure_stage VARCHAR(64) NOT NULL,
    error_code VARCHAR(128) NOT NULL,
    root_cause_category VARCHAR(64) NOT NULL,
    affected_step_id VARCHAR(128),
    retryable BOOLEAN NOT NULL,
    explanation_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_run_failure_explanation UNIQUE(run_type, run_id)
);
```


## 8.8 Failure Incident

```sql
CREATE TABLE regression_failure_incident (
    id UUID PRIMARY KEY,
    regression_run_id UUID NOT NULL UNIQUE,
    schedule_id UUID,
    script_artifact_id UUID NOT NULL,
    case_id UUID NOT NULL,
    failure_category VARCHAR(64) NOT NULL,
    failure_explanation_id UUID NOT NULL,
    owner_user_id VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_failure_incident_owner_status
ON regression_failure_incident(owner_user_id, status, created_at DESC);
```

## 8.9 Agent Conversation Binding

```sql
CREATE TABLE agent_conversation_binding (
    id UUID PRIMARY KEY,
    platform VARCHAR(32) NOT NULL,
    agent_id VARCHAR(128) NOT NULL,
    owner_user_id VARCHAR(128) NOT NULL,
    conversation_id VARCHAR(256),
    notification_inbox_ref VARCHAR(512),
    enabled_channels JSONB NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    locale VARCHAR(32) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    confirmed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(platform, agent_id, owner_user_id)
);
```

## 8.10 Notification Outbox

```sql
CREATE TABLE agent_notification_outbox (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES regression_failure_incident(id),
    notification_type VARCHAR(64) NOT NULL,
    recipient_user_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(256) NOT NULL UNIQUE,
    payload_json JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_by VARCHAR(128),
    claimed_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    last_error_code VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_outbox_claim
ON agent_notification_outbox(status, next_attempt_at)
WHERE status IN ('PENDING', 'RETRY_WAITING');
```

## 8.11 Notification Delivery Attempt

```sql
CREATE TABLE notification_delivery_attempt (
    id UUID PRIMARY KEY,
    outbox_id UUID NOT NULL REFERENCES agent_notification_outbox(id),
    channel VARCHAR(64) NOT NULL,
    attempt INTEGER NOT NULL,
    status VARCHAR(32) NOT NULL,
    platform_message_id VARCHAR(256),
    error_code VARCHAR(128),
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    UNIQUE(outbox_id, channel, attempt)
);
```

## 8.12 Recovery Decision and Session

```sql
CREATE TABLE recovery_decision (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL UNIQUE
        REFERENCES regression_failure_incident(id),
    selected_option VARCHAR(64) NOT NULL,
    selected_by VARCHAR(128) NOT NULL,
    natural_language_change_description TEXT,
    selected_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE reauthoring_session (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL UNIQUE
        REFERENCES regression_failure_incident(id),
    recovery_option VARCHAR(64) NOT NULL,
    old_script_artifact_id UUID NOT NULL,
    new_script_artifact_id UUID,
    status VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0
);
```

# 9. 包完整性与供应链安全

## 9.1 ZIP Intake

处理顺序：

```text
读取文件头
→ 限制压缩包大小
→ 限制解压后总大小
→ 限制文件数量
→ 拒绝加密 ZIP
→ 拒绝符号链接
→ 防 Zip Slip
→ 解压到随机隔离目录
→ 读取 Manifest
→ 校验声明文件和 Hash
→ 扫描文件类型
→ 只读挂载到静态验证目录
```

Java Zip Slip 防护：

```java
static Path safeResolve(Path extractionRoot, String entryName) {
    Path normalized = extractionRoot.resolve(entryName).normalize();
    if (!normalized.startsWith(extractionRoot)) {
        throw new SecurityException("ZIP_SLIP_BLOCKED");
    }
    return normalized;
}
```

## 9.2 文件 Allowlist

允许：

```text
.json
.ts
.md
.png
.jpg
.yaml
.yml
```

禁止：

```text
.exe
.dll
.bat
.cmd
.ps1
.sh
.jar
.class
.node
.so
.dylib
```

脚本包不得包含 `node_modules`。Runner 使用平台锁定依赖。

## 9.3 Hash

```ts
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}
```

---

# 10. 静态验证

## 10.1 验证链

```text
Manifest Schema
→ TypeScript Program
→ ESLint
→ AST Security
→ Import Allowlist
→ URL Allowlist
→ Secret Scan
→ Fixture/Baseline Reference
Action Risk Manifest
High-Risk Commit Evidence
→ Locator Quality
→ Assertion Coverage
```

## 10.2 TypeScript 检查

推荐使用 TypeScript Compiler API，不依赖 Shell 字符串拼接：

```ts
import ts from 'typescript';

export function compileTypeScript(projectPath: string): readonly string[] {
  const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (configFile.error) {
    return [ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')];
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    process.cwd(),
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  return diagnostics.map(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );
    if (!diagnostic.file || diagnostic.start === undefined) {
      return message;
    }
    const position = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start,
    );
    return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
  });
}
```

## 10.3 AST 安全策略

禁止模块：

```ts
export const FORBIDDEN_MODULES = new Set([
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'repl',
  'tls',
  'vm',
  'worker_threads',
]);
```

允许模块示例：

```ts
export const ALLOWED_MODULES = new Set([
  '@playwright/test',
  '../pages/transfer.page',
  '../fixtures/payment.fixture',
]);
```

禁止语法：

```text
eval
new Function
动态 import(expression)
require(variable)
process.env 任意键
process.exit
无限 while(true)
任意 page.goto 外域 URL
page.mouse.click 作为普通控件操作
长时间 waitForTimeout
```

## 10.4 Locator 质量

允许优先级：

```text
getByTestId
getByRole
getByLabel
getByPlaceholder
Scoped getByText
Stable CSS
Controlled XPath
```

拒绝或警告：

```text
nth() 未解释
全局 text 匹配多个元素
动态 class 哈希
绝对 XPath
坐标点击
无等待的立即断言
```

---


## 10.5 High-Risk Action Gate

```ts
export function validateHighRiskActions(
  manifest: ActionRiskManifest,
): readonly string[] {
  const errors: string[] = [];

  for (const entry of manifest.entries) {
    if (entry.riskLevel !== 'HIGH') {
      continue;
    }

    if (
      entry.executionPolicy !==
      'MIDSCENE_LOCATE_PLAYWRIGHT_COMMIT'
    ) {
      errors.push(
        `HIGH_RISK_POLICY_INVALID:${entry.stepId}`,
      );
    }

    if (!entry.playwrightCommitEvidenceRef) {
      errors.push(
        `HIGH_RISK_COMMIT_EVIDENCE_MISSING:${entry.stepId}`,
      );
    }
  }

  return errors;
}
```


# 11. 独立 Playwright Runner

## 11.1 Runner Workspace

```text
runtime/validation/{validationRunId}/
├─ package/
├─ playwright/.auth/
├─ fixture/
├─ output/
├─ test-results/
├─ playwright-report/
└─ logs/
```

目录权限：

- Worker 只能读当前 Package。
- Worker 只能写当前 Run Workspace。
- 运行结束后先上传 Evidence，再清理短期 Secret。

## 11.2 Playwright 配置

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: './output/playwright-results.json' }],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.SUT_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'chromium-pinned',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
```

说明：

- 验证默认 `retries: 0`，避免将首次失败隐藏为 Flaky。
- 资金场景默认 `workers: 1`。
- `serviceWorkers: 'block'` 不写死；仅在 PoC 证明不破坏目标应用时由 Browser Profile 开启。
- 浏览器版本由平台依赖锁和 Browser Profile 固定。

## 11.3 安全启动 Runner

```ts
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);

export interface RunnerLaunchOptions {
  workspace: string;
  configPath: string;
  projectName: string;
  timeoutMs: number;
  env: Record<string, string>;
}

export async function launchPlaywrightRunner(
  options: RunnerLaunchOptions,
): Promise<number> {
  const playwrightCli = require.resolve('@playwright/test/cli');
  const args = [
    playwrightCli,
    'test',
    '--config',
    path.resolve(options.workspace, options.configPath),
    '--project',
    options.projectName,
  ];

  const child = spawn(process.execPath, args, {
    cwd: options.workspace,
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'test',
      ...options.env,
    },
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
  }, options.timeoutMs);

  return await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
}
```

生产实现还必须：

- 限制 stdout/stderr 大小。
- Windows 下超时终止整个进程树。
- 记录 Process ID、启动时间和退出原因。
- 禁止用户提供任意 CLI 参数。

---

# 12. Baseline Comparator

## 12.1 比较顺序

```text
加载 Baseline Version
→ 校验 Baseline Hash
→ 读取 Playwright Result
→ 读取 Network Summary
→ 读取 Output Variables
→ 调用 Business Assertion API
→ 比较 Required Checks
→ 比较 Optional Checks
→ 生成 Comparison Result
```

## 12.2 Required Checks

```text
VISIBLE_TEXT
URL_PATTERN
OUTPUT_FIELD
NETWORK_EVENT
BUSINESS_STATE
NO_UNEXPECTED_ERROR
```

## 12.3 Screenshot

截图只能为 Optional，除非业务场景本身是视觉回归。环境必须固定：

```text
OS/Container Image
Chromium Revision
Viewport
Device Scale Factor
Fonts
Locale
Timezone
Headless Mode
Animations
```

## 12.4 比较器示例

```ts
export interface ActualRunSnapshot {
  visibleTexts: string[];
  url: string;
  outputs: Record<string, unknown>;
  networkEvents: Array<{
    method: string;
    path: string;
    status: number;
  }>;
  businessStates: Record<string, string>;
}

export function compareRequiredVisibleText(
  expectedText: string,
  actual: ActualRunSnapshot,
): boolean {
  return actual.visibleTexts.some(text => text.includes(expectedText));
}

export function compareRequiredUrl(
  pattern: RegExp,
  actual: ActualRunSnapshot,
): boolean {
  return pattern.test(actual.url);
}
```

正则表达式必须由受控 Pattern DSL 生成，禁止用户提交任意高复杂度表达式。

---

# 13. 环境和锁

## 13.1 EnvironmentProfile

```json
{
  "environmentRef": "SIT",
  "displayName": "系统集成测试环境",
  "baseUrl": "https://sit.example.internal",
  "allowedDomains": ["sit.example.internal"],
  "browserProfileRef": "CHROMIUM_PINNED_1440_900",
  "businessDateMode": "FIXED_OR_CONTROLLED",
  "healthCheckUrl": "https://sit.example.internal/health",
  "active": true
}
```

## 13.2 Lock Scope

```text
ENVIRONMENT:{environmentRef}
CASE:{caseId}
ACCOUNT:{logicalAccountRef}
PAYMENT
BUSINESS_DATE
GLOBAL
```

## 13.3 Lock 表

```sql
CREATE TABLE environment_lock (
    id UUID PRIMARY KEY,
    environment_ref VARCHAR(128) NOT NULL,
    lock_scope VARCHAR(255) NOT NULL,
    regression_run_id UUID NOT NULL REFERENCES regression_run(id),
    status VARCHAR(32) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_active_environment_lock
ON environment_lock(environment_ref, lock_scope)
WHERE status = 'ACQUIRED';
```

---

# 14. 定时调度

## 14.1 Cron 方言

### Coze 六字段

```text
second minute hour day-of-month month day-of-week
```

示例必须经过实际企业租户验证后才能保存为 `COZE_SIX_FIELD`。

### Quartz

```text
second minute hour day-of-month month day-of-week [year]
```

示例：

```text
每周三 09:00：0 0 9 ? * WED
每月 1 日 08:30：0 30 8 1 * ?
工作日 10:15：0 15 10 ? * MON-FRI
```

## 14.2 标准化

内部 UI 不直接让普通用户手写 Cron。优先使用结构化表单：

```json
{
  "frequency": "WEEKLY",
  "daysOfWeek": ["WED"],
  "time": "09:00:00",
  "timezone": "Asia/Shanghai"
}
```

后端确定性转换为特定 Dialect。

## 14.3 Quartz 配置

```yaml
spring:
  quartz:
    job-store-type: jdbc
    jdbc:
      initialize-schema: never
    properties:
      org.quartz.scheduler.instanceName: regression-scheduler
      org.quartz.scheduler.instanceId: AUTO
      org.quartz.threadPool.threadCount: 4
      org.quartz.jobStore.isClustered: true
      org.quartz.jobStore.clusterCheckinInterval: 10000
```

生产数据库 Schema 必须通过项目迁移管理，不使用启动时自动覆盖。

## 14.4 Quartz Job

```java
package cn.company.regression.schedule;

import org.quartz.DisallowConcurrentExecution;
import org.quartz.JobExecutionContext;
import org.quartz.JobExecutionException;
import org.springframework.scheduling.quartz.QuartzJobBean;

@DisallowConcurrentExecution
public final class RegressionScheduleJob extends QuartzJobBean {

    private RegressionRunCommandService commandService;
    private String scheduleId;

    // Spring Boot 的 Quartz 自动配置可将常规 Bean 通过 setter 注入 Job。
    public void setCommandService(
            RegressionRunCommandService commandService) {
        this.commandService = commandService;
    }

    // scheduleId 来自 JobDataMap，并按 JavaBean 属性规则注入。
    public void setScheduleId(String scheduleId) {
        this.scheduleId = scheduleId;
    }

    @Override
    protected void executeInternal(JobExecutionContext context)
            throws JobExecutionException {
        if (commandService == null
                || scheduleId == null
                || scheduleId.isBlank()) {
            throw new JobExecutionException(
                new IllegalStateException(
                    "QUARTZ_JOB_DEPENDENCY_OR_SCHEDULE_ID_MISSING"),
                false
            );
        }

        try {
            commandService.createRunFromSchedule(scheduleId);
        } catch (RuntimeException exception) {
            throw new JobExecutionException(exception, false);
        }
    }
}
```

说明：

- Spring Boot 官方 Quartz 集成说明支持通过 setter 向 `QuartzJobBean` 注入常规 Spring Bean；因此本文默认采用 setter 注入，而不是假设 Quartz 会自动支持构造器注入。
- 只有显式配置支持依赖注入的自定义 `JobFactory` 时，才允许改为构造器注入。
- `@DisallowConcurrentExecution` 仅按同一 JobKey 防重入，业务层仍需数据库幂等、环境锁和唯一运行约束。
- Job 只创建 `RegressionRunTask`，不在 Quartz 调度线程中启动浏览器。

## 14.5 Trigger 创建

```java
CronScheduleBuilder scheduleBuilder = CronScheduleBuilder
    .cronSchedule(schedule.cronExpression())
    .inTimeZone(TimeZone.getTimeZone(schedule.timezone()))
    .withMisfireHandlingInstructionDoNothing();

CronTrigger trigger = TriggerBuilder.newTrigger()
    .withIdentity("trigger-" + schedule.scheduleId(), "regression")
    .forJob(jobKey)
    .withSchedule(scheduleBuilder)
    .build();
```

`FIRE_ONCE_NOW` 和 `CATCH_UP_WITH_LIMIT` 必须分别映射，不允许全部使用同一 Misfire 策略。

---

# 15. Queue 和幂等

## 15.1 Job Message

```json
{
  "schemaVersion": "1.0",
  "messageId": "MSG-001",
  "regressionRunId": "RUN-001",
  "scriptArtifactId": "SCRIPT-001",
  "caseId": "REG-PAY-001",
  "baselineId": "BASE-001",
  "environmentRef": "SIT",
  "fixtureProfileRef": "PAYMENT_STANDARD",
  "browserProfileRef": "CHROMIUM_PINNED_1440_900",
  "idempotencyKey": "SCH-001:2026-07-15T09:00:00+08:00",
  "issuedAt": "2026-07-15T09:00:00+08:00",
  "expiresAt": "2026-07-15T09:10:00+08:00"
}
```

## 15.2 Outbox

Schedule 触发时：

```text
创建 regression_run
+ 插入 job_outbox
```

必须在同一数据库事务完成。

## 15.3 Inbox

Worker 必须记录 `messageId`，重复消息返回已有结果，不重复执行资金操作。

---

# 16. 实时事件和 Reporter

## 16.1 Event

```ts
export interface RegressionRunEvent {
  regressionRunId: string;
  sequence: number;
  eventType:
    | 'RUN_STARTED'
    | 'CASE_STARTED'
    | 'STEP_STARTED'
    | 'STEP_COMPLETED'
    | 'CASE_COMPLETED'
    | 'BASELINE_COMPARISON_COMPLETED'
    | 'RUN_COMPLETED';
  occurredAt: string;
  payload: Record<string, unknown>;
}
```

## 16.2 SSE

```text
GET /api/v1/regression-runs/{regressionRunId}/events
```

支持 `Last-Event-ID`，断线后从数据库事件序列补发。

## 16.3 Reporter

```ts
import type {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

export default class PlatformReporter implements Reporter {
  onTestBegin(test: TestCase): void {
    void emitPlatformEvent({
      eventType: 'CASE_STARTED',
      caseTitle: test.title,
    });
  }

  onStepEnd(
    test: TestCase,
    result: TestResult,
    step: TestStep,
  ): void {
    void emitPlatformEvent({
      eventType: 'STEP_COMPLETED',
      caseTitle: test.title,
      stepTitle: step.title,
      durationMs: step.duration,
      status: step.error ? 'FAILED' : 'PASSED',
    });
  }
}
```

生产 Reporter 不能让事件上报失败改变 Playwright 原始测试结果；失败事件应写入本地 Outbox 后补传。

---

# 17. 失败分类

```text
PRODUCT_FAILURE
TEST_SCRIPT_FAILURE
ENVIRONMENT_FAILURE
FIXTURE_FAILURE
AUTHENTICATION_FAILURE
DEPENDENCY_FAILURE
BASELINE_DRIFT
VISUAL_CHANGE
SECURITY_BLOCKED
TIMEOUT
UNKNOWN
```

分类依据：

| 证据 | 倾向分类 |
|---|---|
| 同一脚本多环境均失败 | TEST_SCRIPT_FAILURE 或产品公共问题 |
| 环境 Health 失败 | ENVIRONMENT_FAILURE |
| Fixture Seed 失败 | FIXTURE_FAILURE |
| Locator 唯一性失败且页面版本变化 | VISUAL_CHANGE |
| 业务 API 返回错误且手工复现 | PRODUCT_FAILURE |
| Required Baseline 改变且产品确认新行为 | BASELINE_DRIFT |

分类器可以使用规则和人工输入；正式失败分类不得仅由 LLM 自动决定。

---


## 17.1 Failure Explanation Mapping

| 分类 | 默认错误码 | 建议 |
|---|---|---|
| PRODUCT_FAILURE | `TARGET_PRODUCT_BEHAVIOR_MISMATCH` | 交产品团队确认 |
| TEST_SCRIPT_FAILURE | `PLAYWRIGHT_SCRIPT_EXECUTION_FAILED` | 创建 ReauthoringRequest |
| ENVIRONMENT_FAILURE | `TARGET_ENVIRONMENT_UNAVAILABLE` | 环境恢复后重试 |
| FIXTURE_FAILURE | `FIXTURE_PREPARATION_FAILED` | 检查 Fixture Profile |
| BASELINE_DRIFT | `BASELINE_EXPECTATION_DRIFT` | 人工审核 Baseline |
| VISUAL_CHANGE | `PAGE_VISUAL_STRUCTURE_CHANGED` | 重新进入阶段三 |
| SCHEDULE_FAILURE | `SCHEDULE_TRIGGER_FAILED` | 检查 Trigger/Quartz |
| UNKNOWN | `UNCLASSIFIED_RUN_FAILURE` | 人工分析 |


# 18. ReauthoringRequest

```json
{
  "reauthoringRequestId": "REAUTH-001",
  "regressionRunId": "RUN-001",
  "scriptArtifactId": "SCRIPT-001",
  "caseId": "REG-PAY-001",
  "reasonCategory": "VISUAL_CHANGE",
  "reasonSummary": "确认转账按钮的可访问名称发生变化",
  "evidenceIds": ["EVIDENCE-101", "EVIDENCE-102"],
  "status": "WAITING_HUMAN_CONFIRMATION"
}
```

状态：

```text
DRAFT
→ WAITING_HUMAN_CONFIRMATION
→ APPROVED_FOR_REAUTHORING | REJECTED
→ SENT_TO_AUTHORING
→ RESOLVED
```

---

# 18A. 主动失败通知

## 18A.1 事务边界

以下操作必须位于同一数据库事务：

```text
RegressionRun 写入终态失败
RegressionSchedule 更新为 PAUSED_WAITING_USER_RECOVERY
RegressionFailureIncident 创建
AgentNotificationOutbox 创建
AuditEvent 创建
```

事务成功后由异步 Worker 投递，不允许 Runner 在进程内直接调用 Agent 平台。

## 18A.1A 失败事务应用服务

```java
@Transactional
public RegressionFailureIncident recordTerminalFailure(
        TerminalFailureCommand command) {

    RegressionRun run = runRepository.getRequired(command.runId());
    run.markFailed(
        command.failureCategory(),
        command.failureExplanationId(),
        command.finishedAt());

    RegressionSchedule schedule = null;
    if (run.scheduleId() != null) {
        schedule = scheduleRepository.getRequired(run.scheduleId());
        schedule.pauseWaitingUserRecovery(command.finishedAt());
    }

    RegressionFailureIncident incident =
        incidentRepository.insertIfAbsent(
            RegressionFailureIncident.openFrom(run));

    notificationOutboxRepository.insertIfAbsent(
        AgentFailureNotificationFactory.create(
            incident,
            run,
            schedule));

    auditRepository.append(
        AuditEvent.regressionFailureOpened(
            incident,
            run,
            schedule));

    return incident;
}
```

`insertIfAbsent` 必须以 `regression_run_id` 和通知 `idempotency_key` 的唯一约束实现，不能只在内存中判断。

## 18A.2 FailureNotificationWorker

```ts
export interface AgentPlatformNotificationPort {
  sendFailureNotification(
    binding: AgentConversationBinding,
    notification: AgentFailureNotification,
  ): Promise<{
    readonly status: 'DELIVERED' | 'RETRYABLE_FAILURE' | 'FATAL_FAILURE';
    readonly platformMessageId: string | null;
    readonly errorCode: string | null;
  }>;
}
```

投递顺序：

```text
AGENT_CONVERSATION
→ AGENT_NOTIFICATION_INBOX
→ 企业配置的备用渠道
→ DEAD_LETTER
```

`AGENT_CONVERSATION` 失败不代表 Incident 丢失；Portal 和 Agent Inbox 必须仍可查看。

### FailureNotificationWorker 处理循环

```ts
export async function dispatchPendingNotification(
  record: NotificationOutboxRecord,
  ports: {
    agent: AgentPlatformNotificationPort;
    system: SystemNotificationPort;
  },
): Promise<void> {
  const agentResult = await ports.agent.sendFailureNotification(
    record.binding,
    record.notification,
  );

  if (agentResult.status === 'DELIVERED') {
    await recordDelivered(record, 'AGENT_CONVERSATION', agentResult);
    return;
  }

  await recordAttemptFailure(
    record,
    'AGENT_CONVERSATION',
    agentResult,
  );

  for (const fallback of record.fallbackChannels) {
    const result = await ports.system.send(
      fallback,
      record.destinationRef,
      record.notification,
    );
    if (result.status === 'DELIVERED') {
      await recordDelivered(record, fallback, result);
      return;
    }
  }

  await scheduleRetryOrDeadLetter(record);
}
```

生产代码必须通过数据库 Claim/Lease 防止多个 Worker 同时消费同一 Outbox 记录。

## 18A.3 对话消息内容

必须包含：

```text
Schedule 名称
失败时间
失败分类
失败步骤
ScriptArtifact 版本
Schedule 已暂停说明
Evidence 深链接
两条 RecoveryOption
```

平台支持卡片时：

```text
[放弃脚本，重新输入成功案例]
[描述变化，重新生成]
```

平台不支持卡片时，发送严格编号文本，后续解析用户的 `1`、`2` 或自然语言同义选择。

## 18A.4 投递重试

```yaml
notificationRetry:
  maxAttempts: 8
  initialDelaySeconds: 2
  maxDelaySeconds: 300
  backoffMultiplier: 2
  jitter: true
  deadLetterAfterSeconds: 3600
```

## 18A.5 可选系统通知

可选渠道必须经用户授权和企业审批：

```text
WEB_PUSH
DESKTOP_TOAST
ENTERPRISE_IM
EMAIL
```

系统通知只显示脱敏摘要，完整失败证据通过登录后的 Deep Link 查看。

# 18B. 两路径恢复协调器

## 18B.1 路径一

```text
SELECT_ABANDON
→ ScriptArtifact = ABANDONED_AFTER_FAILURE
→ ReauthoringSession = WAITING_NEW_SUCCESS_CASE
→ 调用 Stage 1 SuccessCaseResubmission
→ 新案例进入 Stage 3
```

## 18B.2 路径二

```text
SELECT_DESCRIBE_CHANGE
→ 保存自然语言变化描述
→ ReauthoringSession = SENT_TO_AUTHORING
→ Stage 3 生成 ChangeImpactAssessment
→ Stage 3 生成 BehaviorPlanPatch
→ 全量重新复刻
```

## 18B.3 恢复 Schedule

新脚本通过后，阶段二返回：

```text
WAITING_USER_DELIVERY_DECISION
```

用户选择替换原 Schedule 时，以下操作同事务：

```text
Schedule.scriptArtifactId = newScriptArtifactId
Schedule.status = ACTIVE
Incident.status = RESOLVED
ReauthoringSession.status = RESOLVED
AuditEvent 写入 Before/After
```

## 18B.4 禁止行为

```text
未经用户选择自动创建 ReauthoringSession
路径二直接编辑旧脚本文件
新脚本未验证即恢复 Schedule
覆盖旧 Artifact
Incident 未解决即删除失败证据
```

# 19. 安全需求

## 19.1 Secret

```text
API Token
Cookie
Storage State
数据库密码
测试账户密码
证书私钥
```

只能通过 Secret Provider 按运行时注入。

禁止：

```text
写入脚本包
写入 Manifest
写入 Agent Prompt
写入 Trace 文本摘要
写入日志
```

## 19.2 Storage State

路径：

```text
runtime/{runId}/playwright/.auth/{profile}.json
```

要求：

- `.gitignore` 忽略。
- ACL 只允许当前 Worker。
- 运行结束删除。
- 不上传为普通 Evidence。

## 19.3 网络

Runner 只允许访问：

```text
环境 Allowlist
Test Support API
Evidence Upload API
Worker Event API
```

禁止公网任意访问。

## 19.4 文件系统

每个 Run 使用独立 Workspace；路径由平台生成，用户不得传入绝对路径。

---

# 20. 可观测性

指标：

```text
script_package_total{status}
static_validation_total{status,check}
script_validation_total{status}
script_validation_duration_seconds
baseline_comparison_total{status,type}
script_artifact_total{status}
regression_schedule_total{status,cron_dialect}
schedule_trigger_total{status}
schedule_trigger_delay_seconds
schedule_misfire_total{policy}
regression_run_total{status,failure_category}
regression_run_duration_seconds
runner_heartbeat_age_seconds
environment_lock_total{status}
reauthoring_request_total{status,reason_category}
```

结构化日志：

```json
{
  "timestamp": "2026-07-15T01:00:03Z",
  "service": "scheduled-regression-worker",
  "level": "INFO",
  "event": "REGRESSION_RUN_COMPLETED",
  "regressionRunId": "RUN-001",
  "scriptArtifactId": "SCRIPT-001",
  "caseId": "REG-PAY-001",
  "status": "PASSED",
  "durationMs": 42100,
  "correlationId": "CORR-001"
}
```

---

# 21. 前端开发规范

- React + TypeScript `strict`。
- Server State 使用 TanStack Query。
- SSE 状态与 REST 快照合并时按 `sequence` 去重。
- Monaco 只读展示正式脚本。
- 所有 Hash、版本和来源必须可见。
- 创建 Schedule 时必须预览未来至少 5 次触发时间。
- Cron 方言和时区必须在同一表单显示。
- 高风险计划必须显示 Environment、Fixture、锁和数据影响。
- Evidence Viewer 不执行不可信 HTML 或脚本。

---

# 22. 后端开发规范

- Controller 不直接写状态机。
- Application Service 管理事务。
- Run、Schedule 和 Package 使用乐观锁。
- Outbox 与业务状态同事务。
- 所有写操作产生 Audit Event。
- Artifact 下载必须鉴权和记录审计。
- Quartz Job 不直接执行浏览器。
- Worker Message 必须幂等。
- 错误统一使用 Problem Details。

示例：

```json
{
  "type": "urn:regression:error:script-not-validated",
  "title": "脚本尚未通过验证",
  "status": 409,
  "code": "SCRIPT_NOT_VALIDATED",
  "detail": "只有 SCRIPT_VALIDATED 或 REGISTERED 的脚本才能创建定时计划",
  "requestId": "REQ-001",
  "correlationId": "CORR-001"
}
```

---

# 23. 测试设计

## 23.1 Unit

```text
Manifest Path Validation
SHA-256
AST Import Rules
Forbidden Syntax
Locator Quality
Cron Dialect Parser
Schedule Normalizer
Misfire Mapping
Baseline Check
Failure Classifier
Lock Expiration
```

## 23.2 Contract

```text
ScriptPackageManifest Schema
ScriptValidationRequest Schema
RegressionSchedule Schema
RegressionRunTask Schema
Worker Event Schema
Evidence Metadata Schema
```

## 23.3 Integration

```text
PostgreSQL Migration
Quartz JDBC JobStore
ActiveMQ Outbox/Inbox
Artifact Storage
Worker Heartbeat
SSE Resume
Environment Lock
```

## 23.4 Security

```text
Zip Slip
Zip Bomb
Symlink
Forbidden Extension
Manifest Omission
Hash Tamper
Secret Scan
Path Traversal
Arbitrary CLI Args
Arbitrary URL
Artifact Authorization
Schedule Privilege Escalation
```

## 23.5 E2E

```text
S2-E2E-001 合法脚本包导入
S2-E2E-002 Hash 不一致拒绝
S2-E2E-003 危险 Import 拒绝
S2-E2E-004 TypeScript 失败
S2-E2E-005 独立验证通过
S2-E2E-006 Baseline 不匹配
S2-E2E-007 人工审批注册
S2-E2E-008 每周三调度
S2-E2E-009 每月一号调度
S2-E2E-010 Misfire Do Not Catch Up
S2-E2E-011 禁止重叠
S2-E2E-012 Worker 崩溃
S2-E2E-013 SSE 恢复
S2-E2E-014 失败分类
S2-E2E-015 ReauthoringRequest
```

## 23.6 稳定性

对同一 `ScriptArtifact`：

```text
连续运行 10 次
环境和数据固定
计算通过率和 Flaky Rate
验证证据 Hash 和清理结果
```

---


## 23.7 Risk and Failure Tests

```text
S2-RISK-001 HIGH 动作错误策略被拒绝
S2-RISK-002 HIGH 动作缺少 Commit Evidence 被拒绝
S2-RISK-003 高风险计划缺少 Maker-Checker 被拒绝
S2-FAIL-001 验证失败生成 FailureExplanation
S2-FAIL-002 定时失败映射正确错误码
S2-FAIL-003 LLM 表述不能修改机器分类
```


## 23.8 Reverse Recovery Tests

```text
S2-REV-001 终态失败同事务创建 Incident/Outbox
S2-REV-002 Schedule 自动暂停
S2-REV-003 Agent Conversation 为第一通知渠道
S2-REV-004 重复失败事件幂等
S2-REV-005 通知重试和 Dead Letter
S2-REV-006 备用渠道降级
S2-REV-007 对话严格显示两条路径
S2-REV-008 路径一标记旧脚本 abandoned
S2-REV-009 路径二必须有变化描述
S2-REV-010 用户选择前禁止自动修复
S2-REV-011 新脚本未验证禁止恢复 Schedule
S2-REV-012 Schedule 替换和 Incident 解决同事务
S2-REV-013 旧 ScriptArtifact 不可覆盖
S2-REV-014 Agent 平台离线后恢复补投
S2-REV-015 未绑定 Conversation 时进入 Agent Inbox
```

# 24. 开发任务拆分

```yaml
tasks:
  - id: S2-ARCH-001
    title: 领域合同、OpenAPI、数据库和状态机
    owner: RegressionPlatformArchitect

  - id: S2-PKG-001
    title: Script Package Intake 和供应链安全
    owner: ScriptSupplyChainAgent
    dependsOn: [S2-ARCH-001]

  - id: S2-STATIC-001
    title: TypeScript、ESLint、AST 和 Locator 门禁
    owner: StaticValidationAgent
    dependsOn: [S2-PKG-001]

  - id: S2-RUNNER-001
    title: 独立 Playwright Validation Runner
    owner: PlaywrightRunnerAgent
    dependsOn: [S2-STATIC-001]

  - id: S2-BASE-001
    title: Baseline Comparator
    owner: BaselineAgent
    dependsOn: [S2-RUNNER-001]

  - id: S2-SCHED-001
    title: Quartz Schedule Registry 和 Trigger Adapter
    owner: SchedulerAgent
    dependsOn: [S2-ARCH-001]

  - id: S2-PORTAL-001
    title: Regression Test Portal
    owner: RegressionFrontendAgent
    dependsOn: [S2-ARCH-001]

  - id: S2-GOV-001
    title: Approval、Lock、Evidence、Audit 和 Reauthoring
    owner: GovernanceAgent
    dependsOn: [S2-ARCH-001]

  - id: S2-E2E-001
    title: 阶段二 E2E、稳定性和安全验收
    owner: Stage2Reviewer
    dependsOn:
      - S2-BASE-001
      - S2-SCHED-001
      - S2-PORTAL-001
      - S2-GOV-001
```

---

# 25. 阶段验收

```text
[ ] 合法 PlaywrightScriptPackage 可导入
[ ] 非法路径、扩展名、Hash 和语法被拒绝
[ ] TypeScript、ESLint 和 AST 门禁可用
[ ] Validation Worker 与 Replication Worker 隔离
[ ] 新 BrowserContext 真实执行通过
[ ] Required Baseline 全部比较
[ ] ScriptArtifact 只有审批后注册
[ ] 每周、每月、一次性和立即执行可用
[ ] Cron 方言和时区明确
[ ] Misfire 策略可验证
[ ] 禁止重叠和环境锁生效
[ ] 定时执行不调用 LLM/Midscene
[ ] 实时事件可断线恢复
[ ] Evidence、Hash、Audit 可追踪
[ ] 失败分类和 ReauthoringRequest 可用
[ ] 同一脚本连续运行稳定性达标
```

---

# 26. Definition of Done

阶段二完成必须满足：

- 完整 Regression Test Portal 可用；
- Script Package、Static Validation、Validation Run、Baseline、Script Artifact、Schedule、Run、Evidence、Approval、Audit 全部落地；
- 独立 Playwright Runner 不复用 Midscene 状态；
- 正式定时执行不调用主控 LLM、视觉 LLM 或 Midscene；
- Quartz 持久化调度、Cron 方言、时区、Misfire 和重叠策略可验证；
- Runner 安全边界、网络 Allowlist、Secret 和 Storage State 管理通过审查；
- 至少 20 个生成脚本完成独立验证；
- 至少 5 个 Schedule 完成实际触发；
- 至少 1 个脚本失效场景形成 ReauthoringRequest；
- 阶段二所有 Unit、Contract、Integration、Security、E2E 和稳定性测试通过。

V5.4 额外完成条件：

- Script Package 包含 `ActionRiskManifest`；
- 所有 HIGH 动作通过 Playwright Commit 路径；
- HIGH 动作无 Commit Evidence 时不能注册；
- 高风险定时任务经过 Maker-Checker；
- 验证和定时失败均生成结构化 `FailureExplanation`；
- Portal 可以展示风险原因码、执行策略、证据和建议；
- 正式 Runner 仍然不调用 Midscene 或任何 LLM。

