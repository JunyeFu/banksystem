# 阶段一：测试目标系统、质量案例输入与 Baseline——需求开发一体化方案 v5.4

> 文档版本：5.4.0  
> 所属阶段：Stage 1  
> 前置条件：本地 Fineract/Mifos 基线可运行，或存在等价可测网页系统  
> 阶段目标：提供稳定、可复刻、可重置、可机器比较的测试目标和人工成功案例  
> 主要使用者：测试人员、测试开发人员、阶段三脚本生产系统、阶段二验证系统

---

# 0. 阶段定位

阶段一不是简单的“演示网页”。它是后续 AI 自动化系统的事实源，必须同时提供：

```text
可人工完成的真实业务流程
可重复的测试数据
可导出的成功案例
可复刻的页面状态
可机器判断的成功 Baseline
可查询的业务终态
可审计的证据链
```

阶段一完成后，任意已登记案例必须满足：

```text
测试人员可以人工重复成功
阶段三可以读取案例并在真实页面复刻
阶段二可以在独立环境执行生成脚本
系统可以判断结果是否与人工成功基线一致
```

---

# 1. 业务需求

## 1.1 目标系统

优先使用完整本地数字银行演示系统：

```text
Customer Portal
Mifos X Staff Portal
Operations Console
Bank Channel Service
Fineract
Mock Clearing
Keycloak
Accounting / Reconciliation / EOD
```

质量平台模拟端：

```text
Quality Case Portal
Quality Case Service
Baseline Service
Fixture Service
Business Assertion Service
Evidence Store
```

## 1.2 主要用户故事

### US-S1-001 创建人工成功案例

作为 TEST_ANALYST，我希望创建一个回归案例，记录入口页面、角色、测试数据、步骤和成功终态，以便 Agent 能理解测试目标。

验收：

```text
Given 测试人员具有 case:create 权限
When 填写案例基本信息和步骤
Then 系统生成唯一 caseId 和 version
And 保存输入来源和 SHA-256
And 状态为 DRAFT
```

### US-S1-002 记录自然语言案例

测试人员可以用自然语言描述：

```text
客户甲登录后向客户乙转账100元，最终页面显示转账成功，交易状态为SETTLED。
```

系统必须保存原文，不得在阶段一自动改写为事实。

### US-S1-003 记录格式化案例

格式化案例至少包含：

```text
步骤序号
动作说明
业务目标
测试数据引用
预期页面状态
预期业务状态
备注
```

### US-S1-004 上传成功视频

系统必须支持成功案例视频、视频元数据、Hash、敏感数据审查和保留期限。

### US-S1-005 建立 Baseline

测试人员必须能够为案例定义强制和可选成功条件。

### US-S1-006 重置测试数据

阶段三和阶段二必须能为每次运行创建独立数据 Namespace，执行后清理。

### US-S1-007 查询业务断言

系统必须提供只读接口，查询交易、余额、总账、对账、审计等业务终态。

### US-S1-008 导出案例包

系统必须导出统一案例包，供 Agent 文件输入或 API 读取。

---


### US-S1-009 维护回归知识资产

作为 TEST_DEVELOPER，我需要维护动作清单模板、业务规则、页面动作目录和风险策略，使阶段三能够基于 RAG 生成受约束的 `FullActionPlan`。

验收：

```text
知识条目有唯一 ID、版本、适用业务域和 Hash
模板中的动作类型必须来自 AtomicActionType
页面动作必须关联页面、业务语义和风险默认值
风险策略必须说明 reasonCode
知识更新必须经过审核并可回滚
```

### US-S1-010 输出失败模式知识

作为 TEST_ANALYST，我需要把人工测试和历史自动化失败整理为 `FailurePatternCatalog`，使 Agent 能够输出可理解的失败原因和处理建议。


### US-S1-011 反向路径一重新输入成功案例

作为测试人员，我在定时回归失败并选择“放弃当前失败脚本”后，可以从 Agent 对话重新上传或输入一个已经人工成功的回归案例。

验收：

```text
[ ] 新输入关联原 RegressionFailureIncident
[ ] 新输入创建新的 RegressionCaseVersion
[ ] 不覆盖旧成功案例、旧脚本和旧失败证据
[ ] 新案例仍需满足“人工已成功”门禁
[ ] 新案例可重新进入完整 ForwardAuthoringFlow
```

### US-S1-012 为反向路径二补充变化证据

作为测试人员，我可以为自然语言变化描述附加：

```text
新成功视频
新截图
页面版本说明
新格式化步骤
新 Baseline 观察
```

这些内容形成 `BehaviorChangeEvidence`，只作为重新规划和视觉复刻输入，不能直接修改正式脚本。

### US-S1-013 维护案例版本和恢复血缘

Quality Case Portal 必须展示：

```text
原 RegressionCaseVersion
失败 RegressionRun
RegressionFailureIncident
RecoveryOption
新 RegressionCaseVersion 或 BehaviorChangeRequest
新 ScriptArtifact
Schedule 替换关系
```

# 2. 功能范围

## 2.1 Quality Case Portal

路由：

```text
/login
/dashboard
/cases
/cases/new
/cases/{caseId}
/cases/{caseId}/versions/{version}
/cases/{caseId}/natural-language
/cases/{caseId}/formatted-steps
/cases/{caseId}/video
/cases/{caseId}/baseline
/cases/{caseId}/manual-runs
/cases/{caseId}/evidence
/cases/{caseId}/export
/fixtures
/baselines
/evidence
/audit
/settings
```

页面能力：

| 页面 | 能力 |
|---|---|
| Dashboard | 案例数量、人工成功率、Baseline 缺失、视频审查、最近导出 |
| Case List | 搜索、标签、业务域、状态、风险、版本 |
| Case Detail | 基本信息、来源、步骤、Baseline、证据、版本 |
| Natural Language | 原始自然语言、语言、提交人、不可变原文 |
| Formatted Steps | 表格编辑、顺序、数据引用、动作描述 |
| Video | 上传、元数据、缩略图、审查、保留期 |
| Baseline | 强制/可选断言、审批、版本 |
| Manual Runs | 记录人工执行成功或失败及证据 |
| Export | 预览 Manifest、Hash、文件列表和下载 |

## 2.2 案例状态机

```text
DRAFT
→ READY_FOR_MANUAL_RUN
→ MANUAL_RUN_IN_PROGRESS
→ MANUAL_RUN_PASSED
→ BASELINE_DRAFT
→ BASELINE_APPROVED
→ READY_FOR_AUTHORING
→ DEPRECATED
```

异常：

```text
MANUAL_RUN_FAILED
VIDEO_REJECTED
BASELINE_REJECTED
DATA_RESET_FAILED
SECURITY_BLOCKED
```

状态迁移规则：

- 未人工成功的案例不得进入 `READY_FOR_AUTHORING`。
- 未审批 Baseline 的案例不得由阶段三正式生产脚本。
- 案例修改后必须创建新版本，旧版本不可覆盖。
- Baseline 与 Case Version 绑定。

---

# 3. 数据合同

## 3.1 RegressionCase

```json
{
  "schemaVersion": "1.0",
  "caseId": "REG-PAY-001",
  "version": "1.0.0",
  "caseName": "正常本行转账",
  "businessDomain": "PAYMENT",
  "businessGoal": "客户甲向客户乙转账100元并成功结算",
  "entry": {
    "url": "http://127.0.0.1:18082/transfers/new",
    "pageId": "customer.transfer.create"
  },
  "actorProfileRef": "customer.alice",
  "fixtureProfileRef": "PAYMENT_STANDARD",
  "sourceRefs": [
    "SOURCE-NL-001",
    "SOURCE-FMT-001",
    "SOURCE-VIDEO-001"
  ],
  "baselineRef": "BASE-PAY-001:1.0.0",
  "riskLevel": "MEDIUM",
  "status": "READY_FOR_AUTHORING",
  "createdBy": "tester01",
  "createdAt": "2026-07-14T09:00:00+08:00"
}
```

## 3.2 NaturalLanguageSource

```json
{
  "sourceId": "SOURCE-NL-001",
  "sourceType": "NATURAL_LANGUAGE",
  "language": "zh-CN",
  "content": "客户甲登录后向客户乙转账100元，最终页面显示转账成功，交易状态为SETTLED。",
  "submittedBy": "tester01",
  "sha256": "<64-hex>",
  "submittedAt": "2026-07-14T09:01:00+08:00"
}
```

## 3.3 FormattedCaseSource

```json
{
  "sourceId": "SOURCE-FMT-001",
  "sourceType": "FORMATTED_STEPS",
  "steps": [
    {
      "sequence": 1,
      "description": "选择客户乙作为收款人",
      "inputRefs": ["fixture.customer.bob"],
      "expectedObservation": "收款人字段显示测试客户乙"
    },
    {
      "sequence": 2,
      "description": "输入100元",
      "inputRefs": ["fixture.transferAmount"],
      "expectedObservation": "金额字段显示100.00"
    },
    {
      "sequence": 3,
      "description": "点击确认转账",
      "expectedObservation": "页面显示转账成功"
    }
  ],
  "sha256": "<64-hex>"
}
```

## 3.4 VideoSource

```json
{
  "sourceId": "SOURCE-VIDEO-001",
  "sourceType": "VIDEO",
  "storageUri": "artifact://quality-cases/REG-PAY-001/source.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 12345678,
  "durationMs": 42000,
  "width": 1440,
  "height": 900,
  "frameRate": 30,
  "sha256": "<64-hex>",
  "redactionStatus": "APPROVED",
  "retentionUntil": "2026-08-14T00:00:00+08:00"
}
```

## 3.5 BaselineDefinition

强制检查必须优先于截图：

```json
{
  "schemaVersion": "1.0",
  "baselineId": "BASE-PAY-001",
  "version": "1.0.0",
  "caseId": "REG-PAY-001",
  "caseVersion": "1.0.0",
  "requiredChecks": [
    {
      "checkId": "CHK-UI-001",
      "type": "VISIBLE_TEXT",
      "expected": "转账成功"
    },
    {
      "checkId": "CHK-URL-001",
      "type": "URL_PATTERN",
      "expected": "/transfers/*"
    },
    {
      "checkId": "CHK-NET-001",
      "type": "NETWORK_RESPONSE",
      "method": "POST",
      "pathPattern": "/api/v1/transfers",
      "expectedStatus": 201
    },
    {
      "checkId": "CHK-OUT-001",
      "type": "OUTPUT_EXISTS",
      "outputName": "paymentId"
    },
    {
      "checkId": "CHK-BIZ-001",
      "type": "BUSINESS_STATE",
      "assertionRef": "payment.status",
      "expected": "SETTLED"
    }
  ],
  "optionalChecks": [
    {
      "checkId": "CHK-VIS-001",
      "type": "SCREENSHOT",
      "snapshotName": "transfer-success.png",
      "maxDiffPixelRatio": 0.01
    }
  ],
  "status": "APPROVED"
}
```

Baseline 检查类型：

```text
VISIBLE_TEXT
ELEMENT_VISIBLE
ELEMENT_TEXT
URL_EQUALS
URL_PATTERN
NETWORK_REQUEST
NETWORK_RESPONSE
OUTPUT_EXISTS
OUTPUT_EQUALS
BUSINESS_STATE
JSON_SCHEMA
SCREENSHOT
NO_CONSOLE_ERROR
NO_UNHANDLED_DIALOG
```

---


# 3A. RAG 知识资产

阶段一负责生产和维护可供阶段三检索的业务知识，不负责执行 RAG 推理。

## 3A.1 ActionListTemplateCatalog

```yaml
catalogVersion: 1.0.0
templates:
  - templateId: ACTION-TEMPLATE-INTERNAL-TRANSFER
    caseType: INTERNAL_TRANSFER_SUCCESS
    businessDomain: PAYMENT
    requiredActions:
      - actionType: TAP
        semanticTarget: 收款人选择控件
        defaultRiskLevel: LOW
      - actionType: INPUT
        semanticTarget: 转账金额输入框
        defaultRiskLevel: LOW
      - actionType: TAP
        semanticTarget: 确认转账按钮
        defaultRiskLevel: HIGH
    requiredSuccessCriteria:
      - visibleText: 转账成功
      - businessState: SETTLED
```

模板只能规定动作结构和必须验证的终态，不得包含真实账号、密码、Token 或运行时 ID。

## 3A.2 BusinessRuleCorpus

每条业务规则包括：

```json
{
  "ruleId": "BUSINESS-RULE-PAYMENT-001",
  "businessDomain": "PAYMENT",
  "title": "转账提交属于不可逆高风险动作",
  "content": "确认转账后会产生资金状态变化，必须使用 Playwright Commit 路径并验证业务状态。",
  "riskReasonCode": "FUNDS_STATE_CHANGE",
  "effectiveFrom": "2026-07-14",
  "version": "1.0.0"
}
```

## 3A.3 PageActionCatalog

```json
{
  "pageActionId": "PAGE-ACTION-TRANSFER-CONFIRM",
  "pageId": "customer.transfer.create",
  "semanticTarget": "确认转账按钮",
  "supportedAtomicActionTypes": ["TAP", "LOCATE"],
  "defaultRiskLevel": "HIGH",
  "stableAttributes": {
    "role": "button",
    "accessibleName": "确认转账",
    "testId": "transfer-confirm"
  }
}
```

## 3A.4 RiskPolicyCatalog

```yaml
policyVersion: 1.0.0
rules:
  - reasonCode: FUNDS_STATE_CHANGE
    match:
      businessDomain: PAYMENT
      semanticTargetPattern: "确认|提交|转账"
    riskLevel: HIGH
    executionPolicy: MIDSCENE_LOCATE_PLAYWRIGHT_COMMIT

  - reasonCode: TEXT_INPUT
    match:
      actionType: INPUT
    riskLevel: LOW
    executionPolicy: MIDSCENE_DIRECT
```

## 3A.5 FailurePatternCatalog

```json
{
  "patternId": "FAILURE-PATTERN-LOCATOR-AMBIGUOUS",
  "errorCode": "ACTION_TARGET_AMBIGUOUS",
  "rootCauseCategory": "VISUAL_LOCATOR",
  "symptoms": [
    "多个视觉候选",
    "DOM 对齐结果不唯一"
  ],
  "recommendedAction": "补充目标控件语义或人工确认页面区域",
  "retryable": false
}
```

## 3A.6 知识打包

阶段一导出案例包时应包含：

```text
knowledge/
├─ action-list-template-refs.json
├─ business-rule-refs.json
├─ page-action-refs.json
├─ risk-policy-version.json
└─ failure-pattern-refs.json
```

这里只保存引用和版本，完整知识由 `regression-knowledge-service` 提供。


# 3B. V5.4 反向恢复输入资产

## 3B.1 SuccessCaseResubmission

```ts
export interface SuccessCaseResubmission {
  readonly resubmissionId: string;
  readonly incidentId: string;
  readonly oldCaseVersionId: string;
  readonly source:
    | NaturalLanguageSource
    | FormattedCaseSource
    | VideoSource;
  readonly provenSuccess:
    | {
        readonly type: 'MANUAL_EXECUTION';
        readonly manualRunId: string;
      }
    | {
        readonly type: 'RECORDED_VIDEO';
        readonly videoSourceId: string;
      };
  readonly submittedBy: string;
  readonly submittedAt: string;
}
```

规则：

```text
provenSuccess 必填
incidentId 必须处于路径一恢复状态
新版本号必须大于旧版本
不继承旧 ScriptArtifact
可以继承经过人工确认仍有效的 FixtureProfile
```

## 3B.2 BehaviorChangeEvidence

```ts
export interface BehaviorChangeEvidence {
  readonly evidenceId: string;
  readonly incidentId: string;
  readonly evidenceType:
    | 'NATURAL_LANGUAGE'
    | 'FORMATTED_STEPS'
    | 'SCREENSHOT'
    | 'SUCCESS_VIDEO'
    | 'PRODUCT_CHANGE_NOTE';
  readonly artifactRef: string;
  readonly sha256: string;
  readonly redactionStatus: 'PASSED' | 'REJECTED';
}
```

## 3B.3 CaseRecoveryLineage

```json
{
  "lineageId": "LINEAGE-001",
  "incidentId": "INC-001",
  "oldCaseVersionId": "CASEVER-001",
  "oldScriptArtifactId": "SCRIPT-001",
  "recoveryOption": "DESCRIBE_CHANGE_AND_REAUTHOR",
  "newCaseVersionId": "CASEVER-002",
  "newScriptArtifactId": "SCRIPT-002",
  "scheduleId": "SCH-001"
}
```

# 4. 系统架构

## 4.1 Container

```text
Quality Case Portal
        │ REST/SSE
        ▼
Quality Case Service
├─ Case Registry
├─ Source Registry
├─ Manual Run Registry
├─ Export Service
├─ Approval
└─ Audit
        │
        ├─ PostgreSQL
        ├─ Artifact Store
        ├─ Baseline Service
        ├─ Fixture Service
        └─ Business Assertion Service
```

## 4.2 工程结构

```text
apps/quality-case-portal/
├─ src/app/
├─ src/pages/
├─ src/features/case/
├─ src/features/source/
├─ src/features/video/
├─ src/features/baseline/
├─ src/features/manual-run/
├─ src/features/export/
├─ src/features/evidence/
└─ src/features/audit/

services/quality-case-service/
├─ src/main/java/.../casecatalog/
├─ src/main/java/.../source/
├─ src/main/java/.../manualrun/
├─ src/main/java/.../export/
├─ src/main/java/.../approval/
└─ src/main/java/.../audit/

services/fixture-service/
services/baseline-service/
services/test-support-service/
packages/regression-case-contracts/
contracts/schemas/stage1/
```

---

# 5. API 设计

## 5.1 Quality Case API

```text
POST   /api/v1/quality-cases
GET    /api/v1/quality-cases
GET    /api/v1/quality-cases/{caseId}
POST   /api/v1/quality-cases/{caseId}/versions
POST   /api/v1/quality-cases/{caseId}:submit-manual-run
POST   /api/v1/quality-cases/{caseId}:approve-baseline
POST   /api/v1/quality-cases/{caseId}:deprecate
POST   /api/v1/quality-cases/{caseId}/exports
GET    /api/v1/quality-cases/{caseId}/exports/{exportId}
```

## 5.2 Source API

```text
POST /api/v1/quality-cases/{caseId}/sources:natural-language
POST /api/v1/quality-cases/{caseId}/sources:formatted-steps
POST /api/v1/quality-cases/{caseId}/sources:video
GET  /api/v1/quality-cases/{caseId}/sources
```

视频上传采用 multipart，元数据由服务端检测，不信任客户端声明。

## 5.3 Baseline API

```text
POST /api/v1/baselines
GET  /api/v1/baselines/{baselineId}/versions/{version}
POST /api/v1/baselines/{baselineId}/versions/{version}:approve
POST /api/v1/baselines/{baselineId}/versions/{version}:reject
```

## 5.4 Fixture API

```text
POST /internal/api/v1/fixture-namespaces
POST /internal/api/v1/fixture-namespaces/{namespaceId}:seed
POST /internal/api/v1/fixture-namespaces/{namespaceId}:reset
DELETE /internal/api/v1/fixture-namespaces/{namespaceId}
GET /internal/api/v1/fixture-namespaces/{namespaceId}/resources/{logicalRef}
```

创建 Namespace：

```json
{
  "ownerType": "REPLICATION_RUN",
  "ownerId": "REP-001",
  "fixtureProfileRef": "PAYMENT_STANDARD",
  "expiresAt": "2026-07-14T10:00:00+08:00"
}
```

## 5.5 Business Assertion API

```text
GET /internal/api/v1/assertions/payments/{paymentId}
GET /internal/api/v1/assertions/ledger/{correlationId}
GET /internal/api/v1/assertions/reconciliation/{correlationId}
GET /internal/api/v1/assertions/cases/{caseId}/runs/{runId}
```

只读，不得提供任意 SQL。

---


## 5.6 Knowledge Catalog API

```text
GET /api/v1/knowledge/action-list-templates
GET /api/v1/knowledge/action-list-templates/{templateId}
GET /api/v1/knowledge/business-rules
GET /api/v1/knowledge/page-actions
GET /api/v1/knowledge/risk-policies/current
GET /api/v1/knowledge/failure-patterns
POST /api/v1/knowledge-bundles:export
```

所有返回对象必须包含：

```text
version
sha256
effectiveFrom
reviewStatus
```


## 5.7 Recovery Source API

```text
POST /api/v1/failure-incidents/{incidentId}/success-case-resubmissions
POST /api/v1/failure-incidents/{incidentId}/change-evidence
GET  /api/v1/failure-incidents/{incidentId}/case-lineage
GET  /api/v1/cases/{caseId}/recovery-history
```

写入要求：

```text
Incident 必须存在
User 必须是 Incident Owner 或有 recovery:manage 权限
Artifact 必须先完成 Hash 和脱敏检查
任何写入都产生 AuditEvent
```

# 6. 数据库设计

## 6.1 Case

```sql
CREATE TABLE quality_case (
    id UUID PRIMARY KEY,
    case_code VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    business_domain VARCHAR(64) NOT NULL,
    risk_level VARCHAR(32) NOT NULL,
    current_version VARCHAR(32) NOT NULL,
    status VARCHAR(64) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE quality_case_version (
    id UUID PRIMARY KEY,
    quality_case_id UUID NOT NULL REFERENCES quality_case(id),
    semantic_version VARCHAR(32) NOT NULL,
    case_json JSONB NOT NULL,
    case_sha256 CHAR(64) NOT NULL,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (quality_case_id, semantic_version)
);
```

## 6.2 Source

```sql
CREATE TABLE quality_case_source (
    id UUID PRIMARY KEY,
    case_version_id UUID NOT NULL REFERENCES quality_case_version(id),
    source_type VARCHAR(32) NOT NULL,
    content_json JSONB,
    storage_uri VARCHAR(1024),
    content_type VARCHAR(128),
    size_bytes BIGINT,
    sha256 CHAR(64) NOT NULL,
    redaction_status VARCHAR(32) NOT NULL,
    retention_until TIMESTAMPTZ,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_case_source_version
ON quality_case_source(case_version_id, source_type);
```

## 6.3 Baseline

```sql
CREATE TABLE baseline_definition (
    id UUID PRIMARY KEY,
    baseline_code VARCHAR(128) NOT NULL,
    case_version_id UUID NOT NULL REFERENCES quality_case_version(id),
    semantic_version VARCHAR(32) NOT NULL,
    baseline_json JSONB NOT NULL,
    sha256 CHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    approved_by VARCHAR(128),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (baseline_code, semantic_version)
);
```

## 6.4 Manual Run

```sql
CREATE TABLE manual_case_run (
    id UUID PRIMARY KEY,
    case_version_id UUID NOT NULL REFERENCES quality_case_version(id),
    fixture_namespace_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL,
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_manifest_uri VARCHAR(1024),
    correlation_id VARCHAR(128) NOT NULL,
    performed_by VARCHAR(128) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ
);
```

## 6.5 Evidence

```sql
CREATE TABLE evidence_object (
    id UUID PRIMARY KEY,
    owner_type VARCHAR(64) NOT NULL,
    owner_id UUID NOT NULL,
    evidence_type VARCHAR(64) NOT NULL,
    storage_uri VARCHAR(1024) NOT NULL,
    content_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    redaction_level VARCHAR(32) NOT NULL,
    retention_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---


## 6.6 Knowledge Catalog

```sql
CREATE TABLE regression_knowledge_entry (
    id UUID PRIMARY KEY,
    knowledge_key VARCHAR(160) NOT NULL,
    knowledge_type VARCHAR(64) NOT NULL,
    business_domain VARCHAR(64),
    version VARCHAR(32) NOT NULL,
    content_json JSONB NOT NULL,
    sha256 CHAR(64) NOT NULL,
    review_status VARCHAR(32) NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_regression_knowledge_version
      UNIQUE (knowledge_key, version)
);

CREATE INDEX idx_regression_knowledge_lookup
ON regression_knowledge_entry(
    knowledge_type,
    business_domain,
    review_status,
    effective_from
);
```

禁止把向量作为唯一事实源。向量索引必须可以从 `content_json` 和版本化文档重建。


## 6.7 Recovery Lineage

```sql
CREATE TABLE case_recovery_lineage (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL,
    old_case_version_id UUID NOT NULL,
    old_script_artifact_id UUID NOT NULL,
    recovery_option VARCHAR(64) NOT NULL,
    new_case_version_id UUID,
    new_script_artifact_id UUID,
    schedule_id UUID,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_case_recovery_incident
ON case_recovery_lineage(incident_id);
```

## 6.8 Behavior Change Evidence

```sql
CREATE TABLE behavior_change_evidence (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL,
    evidence_type VARCHAR(64) NOT NULL,
    storage_uri VARCHAR(1024) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    redaction_status VARCHAR(32) NOT NULL,
    uploaded_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

# 7. 页面测试契约

## 7.1 页面容器

```tsx
export type PageState = 'LOADING' | 'READY' | 'ERROR' | 'SUCCESS';

export function TestablePage(props: {
  pageId: string;
  state: PageState;
  children: React.ReactNode;
}) {
  return (
    <main
      data-page-id={props.pageId}
      data-page-state={props.state}
      aria-busy={props.state === 'LOADING'}
    >
      {props.children}
    </main>
  );
}
```

## 7.2 控件要求

关键控件至少满足一项用户可感知定位和一个显式测试契约：

```text
role + accessible name
label
placeholder
data-testid
```

示例：

```tsx
<label htmlFor="transfer-amount">转账金额</label>
<input
  id="transfer-amount"
  name="amount"
  inputMode="decimal"
  aria-label="转账金额"
  data-testid="transfer-amount"
/>
```

禁止：

```text
只有随机 class
无 label 的输入框
按钮只有图标且无 aria-label
成功信息只在 Canvas 且无业务状态查询
```

---

# 8. Fixture 实现

## 8.1 Namespace

```ts
export interface FixtureNamespace {
  namespaceId: string;
  ownerType: 'MANUAL_RUN' | 'REPLICATION_RUN' | 'VALIDATION_RUN' | 'REGRESSION_RUN';
  ownerId: string;
  fixtureProfileRef: string;
  status: 'CREATED' | 'SEEDED' | 'RESETTING' | 'RELEASED' | 'FAILED';
  expiresAt: string;
}
```

## 8.2 资源解析

```ts
export interface FixtureResolver {
  resolve(namespaceId: string, logicalRef: string): Promise<unknown>;
}
```

模型和脚本只接触逻辑引用：

```text
fixture.customer.alice
fixture.customer.bob
fixture.account.alice.primarySavings
fixture.transferAmount
```

不得猜测数据库 ID。

## 8.3 认证状态

认证文件放在运行专属目录：

```text
runtime/{runId}/playwright/.auth/{role}.json
```

要求：

- 写入 `.gitignore`。
- 文件 ACL 仅当前 Worker 可读。
- Artifact 打包时排除。
- 执行结束立即删除。
- 不写日志和 Prompt。

---

# 9. 案例导出包

```text
REG-PAY-001-v1.0.0/
├─ manifest.json
├─ regression-case.json
├─ sources/
│  ├─ natural-language.json
│  ├─ formatted-steps.json
│  └─ source-video.ref.json
├─ baseline.json
├─ fixture-profile.ref.json
├─ manual-run-summary.json
├─ evidence-manifest.json
├─ knowledge-reference-manifest.json
└─ checksums.txt
```

Manifest：

```json
{
  "packageType": "REGRESSION_CASE_PACKAGE",
  "schemaVersion": "1.0",
  "caseId": "REG-PAY-001",
  "caseVersion": "1.0.0",
  "baselineId": "BASE-PAY-001",
  "baselineVersion": "1.0.0",
  "createdAt": "2026-07-14T09:30:00+08:00",
  "files": [
    {
      "path": "regression-case.json",
      "sha256": "<64-hex>"
    }
  ]
}
```

导出时禁止内嵌：

```text
Password
Token
Cookie
Storage State
数据库凭据
真实 PII
```

---

# 10. 视频处理

## 10.1 格式限制

```text
允许：mp4, webm, mov
最大大小：由公司政策配置，默认建议 500 MB
最大时长：默认建议 30 分钟
推荐：1440×900 或 1920×1080
```

## 10.2 元数据命令

```bash
ffprobe -v error -show_format -show_streams -of json input.mp4
```

## 10.3 抽帧

```bash
ffmpeg -i input.mp4 \
  -vf "fps=2,scale=1440:-2" \
  runtime/video/{sourceId}/frame-%06d.jpg
```

视频抽帧属于阶段三执行，但阶段一必须保存原始文件引用和审查结果。

---

# 11. 前端开发规范

```text
React
TypeScript strict
Vite
React Router
TanStack Query
React Hook Form
Zod
Ant Design 或公司 UI Kit
Monaco/JSON Viewer
Vitest
React Testing Library
```

规则：

- 页面组件不得直接 `fetch`。
- Query Key 集中维护。
- Zustand 仅保存 UI 状态。
- 表单 DTO 和服务端 Contract 对齐。
- 视频上传必须显示进度、Hash 和审查状态。
- 所有页面必须有 Loading/Error/Empty/Permission 状态。
- Evidence 不渲染不可信 HTML。

---

# 12. 后端开发规范

```text
Java 21
Spring Boot
Spring MVC 或 WebFlux 二选一并固定
Spring Security
Spring Data JPA
Liquibase
PostgreSQL
Object Storage Adapter
Micrometer/OpenTelemetry
```

分层：

```text
controller
→ application service
→ domain
→ repository / adapter
```

要求：

- Controller 不直接操作 Repository。
- 状态机集中管理。
- 所有版本对象不可覆盖。
- 所有写操作审计。
- 所有下载鉴权。
- 文件类型根据内容检测，不只看扩展名。
- Zip 导出防路径穿越。

---

# 13. 安全需求

## 13.1 视频和证据

- 上传后执行 Malware/格式检查。
- 文件名不可直接作为存储路径。
- 视频必须经过 PII/Secret 人工或工具审查。
- 默认短期保留抽帧和原始视频副本。
- 下载采用受控短期链接。

## 13.2 Test Support

- 只在 local/test/SIT Profile 启用。
- 使用独立 Service Account。
- 不得绕过业务状态机。
- 不得直接写核心账务数据库。
- 不得提供任意 SQL 接口。

## 13.3 Prompt Injection 源

案例文本、网页文本和视频 OCR 都是不可信输入。阶段一必须标记来源，阶段三不得把网页内容作为系统指令。

---

# 14. 可观测性

指标：

```text
quality_case_total{status}
quality_case_export_total{status}
knowledge_entry_total{type,status}
knowledge_bundle_export_total{status}
manual_case_run_total{status}
baseline_total{status}
fixture_namespace_total{status}
fixture_reset_duration_seconds
video_upload_total{status}
evidence_storage_bytes
```

日志：

```json
{
  "timestamp": "2026-07-14T09:30:00+08:00",
  "service": "quality-case-service",
  "level": "INFO",
  "event": "CASE_EXPORT_COMPLETED",
  "caseId": "REG-PAY-001",
  "caseVersion": "1.0.0",
  "exportId": "EXP-001",
  "requestId": "REQ-001",
  "correlationId": "CORR-001",
  "outcome": "SUCCESS"
}
```

---

# 15. 测试设计

## 15.1 Unit

```text
Case 状态机
Semantic Version
Hash
Baseline Validator
Fixture Namespace
Video Metadata
Export Manifest
Redaction
```

## 15.2 Contract

```text
RegressionCase Schema
Source Schema
Baseline Schema
Evidence Schema
Fixture API
Assertion API
```

## 15.3 Integration

```text
PostgreSQL
Object Storage
Fixture Seed/Reset
Keycloak
Fineract Adapter
Business Assertion
```

## 15.4 Security

```text
恶意文件名
Zip Slip
超大文件
错误 MIME
公式注入（格式化 XLS 输入时）
未授权下载
Secret 泄露
真实 PII
越权 Test Support
```

## 15.5 E2E

```text
S1-E2E-001 创建自然语言案例
S1-E2E-002 创建格式化案例
S1-E2E-003 上传视频
S1-E2E-004 人工成功执行
S1-E2E-005 创建并审批 Baseline
S1-E2E-006 Seed/Reset
S1-E2E-007 导出完整案例包
S1-E2E-008 版本不可覆盖
S1-E2E-009 非法视频拒绝
S1-E2E-010 Evidence 下载鉴权
```

---


## 15.7 Knowledge Assets

```text
S1-KB-001 动作模板动作类型合法
S1-KB-002 业务规则 Hash 和版本
S1-KB-003 风险规则执行策略合法
S1-KB-004 PageAction 与页面契约一致
S1-KB-005 FailurePattern 错误码唯一
S1-KB-006 知识包可重建
```


## 15.8 Reverse Recovery Source Tests

```text
S1-REC-001 路径一必须提交人工成功证据
S1-REC-002 路径一创建新 CaseVersion
S1-REC-003 旧案例和失败证据不可覆盖
S1-REC-004 路径二可上传变化截图
S1-REC-005 路径二可上传新成功视频
S1-REC-006 未脱敏证据拒绝
S1-REC-007 Incident Owner 权限
S1-REC-008 CaseRecoveryLineage 唯一
```

# 16. 开发任务拆分

```yaml
tasks:
  - id: S1-0001
    title: RegressionCase、Source、Baseline Contract
    owner: Stage1ContractAgent

  - id: S1-0101
    title: Quality Case Service 和数据库
    owner: Stage1BackendAgent
    dependsOn: [S1-0001]

  - id: S1-0201
    title: Quality Case Portal
    owner: Stage1FrontendAgent
    dependsOn: [S1-0101]

  - id: S1-0301
    title: Fixture Namespace 和认证状态
    owner: FixtureAgent
    dependsOn: [S1-0101]

  - id: S1-0401
    title: Baseline 和 Business Assertion
    owner: BaselineAgent
    dependsOn: [S1-0101, S1-0301]

  - id: S1-0501
    title: 视频、Evidence 和导出包
    owner: EvidenceAgent
    dependsOn: [S1-0101]

  - id: S1-0601
    title: 30–50 条人工成功案例
    owner: CasePreparationAgent
    dependsOn: [S1-0201, S1-0301, S1-0401]

  - id: S1-0701
    title: 阶段一安全与最终验收
    owner: Stage1Reviewer
    dependsOn: [S1-0501, S1-0601]
```

---

# 17. 阶段验收

```text
[ ] 完整银行演示系统可用
[ ] Quality Case Portal 可用
[ ] 三种输入来源可保存和导出
[ ] 原始自然语言不可变
[ ] 视频完成 Hash 和敏感审查
[ ] 每个案例有人工成功记录
[ ] 每个正式案例有 Approved Baseline
[ ] Fixture Namespace 独立、可重置、可清理
[ ] Storage State 未进入导出包
[ ] Business Assertion 可查询
[ ] 页面测试契约完整
[ ] 案例包 Schema 和 Hash 通过
[ ] 至少 30 条公司真实或高保真案例
[ ] 审计和权限生效
```

# 18. Definition of Done

阶段一完成后，阶段三只需提供 `caseId + version` 或案例导出包，即可获取完整输入、测试数据逻辑引用、入口、角色、人工成功证据和机器 Baseline；阶段二可以在独立 Namespace 中验证脚本，且所有结果可追踪回原案例版本。

V5.4 额外完成条件：

- `ActionListTemplateCatalog`、`BusinessRuleCorpus`、`PageActionCatalog`、`RiskPolicyCatalog` 和 `FailurePatternCatalog` 已版本化；
- 每个高风险页面动作具有风险原因码和 Playwright Commit 策略；
- 案例导出包携带知识版本引用；
- 知识条目可审核、可回滚、可重建向量索引；
- 阶段三可以通过 API 获取经审核的知识快照。

