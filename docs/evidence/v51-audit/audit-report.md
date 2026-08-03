---
id: DOC-D6F1A36416
title: V5.1 阶段一审计报告：现状缺陷全清单
document_type: reference
domain: evidence
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# V5.1 阶段一审计报告：现状缺陷全清单

> 历史审计记录：原背景资料目录已迁移并删除，相关 V5.1/V5.4 资料快照保留在 `rag`；当前产品定位和 v5.4 外网演示边界见 `docs/architecture/v5.4-external-demo-baseline.md`。本报告中的 V5.1 结论保持历史证据，不因新规划而改写。

> 审计时间：2026-07-13
> 审计依据：
> - RAG 中的 V5.1 阶段一背景资料快照（原 `background information/落地方案 V5.1/阶段一_测试目标系统质量案例输入与Baseline_v5.1.md`，223 行）
> - RAG 中的 V5.1 PoC 冻结决策快照（原 `background information/落地方案 V5.1/00_V5.1_PoC验证结果与冻结架构决策.md`，114 行）
> 审计方法：逐节对照 V5.1 阶段一 §1–§13 + V5.1 冻结架构决策 ADR-051-01~07 与当前 `D:\Agent\banksystem` 项目状态
> 审计约束：边审计边记录，完成前不中断；涵盖了已完成的 v4 P0/P1/P2 修复成果
> 项目当前状态摘要：
> - v4 P0(3 项)+ P1(11 项)+ P2(规划中)已落地；镜像 `local/bank-channel-service:0.1.0` 已部署
> - 状态名已全量重命名为 v4 §10.3 12 态
> - schema.sql 已迁至 Liquibase v1+v2
> - mvnw + portable JDK 21 + Maven 3.9.9 已就绪
> - Keycloak `bank-channel-service` 服务账户已分配 5 个角色

---

## 0. 审计结论速览

V5.1 阶段一相对 v4 阶段一，**范围质变扩展**：从"完整银行演示系统 + 测试断言"扩展到"完整银行系统 + 质量案例平台 + 视频证据系统 + Baseline 机器比较 + 5 服务 + 3 输入格式"。当前项目**远未达成 V5.1 阶段一要求**。

### 总得分

| 节 | 应交付项数 | 已交付 | 缺失 | 完成度 |
|----|------------|--------|------|--------|
| §1 最终产物 | 9 | 3 | 6 | 33% |
| §2 工程结构 | 8 目录 | 3 | 5 | 38% |
| §3 RegressionCase | 1 契约 | 0 | 1 | 0% |
| §4 BaselineDefinition | 1 契约 | 0 | 1 | 0% |
| §5 Quality Case Portal | 8 路由 + 5 功能 | 0 | 全 | 0% |
| §6 页面测试契约 | 8 属性 | 5 | 3 | 63% |
| §7 Fixture 与认证 | 4 端点 + 4 规则 | 3 | 1 + 部分 | 50% |
| §8 Assertion API | 4 端点 | 3 | 1 + 缺 caseId 维度 | 50% |
| §9 视频规范 | 6 规则 | 0 | 6 | 0% |
| §10 数据库 | 2 表 | 0 | 2 | 0% |
| §11 审计事件 | 8 类型 | 0 | 8 | 0% |
| §12 DoD | 8 项 | 1 | 7 | 13% |
| §13 Definition of Done | 1 闭环 | 部分(转账/清算/EOD) | 缺案例驱动 | 40% |
| ADR-051 | 7 项 | 0 | 7 | 0% |

**总完成度约 26%，V5.1 阶段一不通过。**

---

## §1 最终产物审计

V5.1 §1 列 9 项最终产物。

| 产物 | 当前状态 | 缺陷 |
|------|----------|------|
| 完整银行演示系统 |  部分(已有 bank-channel-service + mock-clearing-service + Fineract + Mifos X) | 缺 `quality-case-portal` 等 3 个新前端/服务 |
| Customer Portal | PASS(15 路由，P1 后 pageId 全统一) | 无 |
| Mifos X Staff Portal | PASS(mifos-isolated-web-app 容器 18080 端口) | 无 |
| Operations Console | PASS(12 路由) | 无 |
| **Quality Case Portal** | **缺失** | V5.1 §5 要求的 8 路由 5 功能前端，**完全未实现**；`apps/` 目录仅有 customer-portal 与 operations-console |
| **Fixture Service** | **部分** | 现有 fixture 端点内嵌在 `TestSupportController`(bank-channel-service)，未独立为 `services/fixture-service/` |
| **Baseline Registry** | **缺失** | `contracts/baseline.schema.json` 与 `services/baseline-service/` **完全不存在** |
| **Business Assertion Service** | **部分** | assertion 端点内嵌在 `TestSupportController`，未独立 `services/assertion-service/` |
| **Evidence Store** | **缺失** | 无任何证据存储服务；当前 `docs/evidence/` 仅作为开发文档目录，非运行时服务 |

### 缺陷编号 V51-DEF-001 ~ V51-DEF-006
- **V51-DEF-001** `apps/quality-case-portal/` 目录与前端项目缺失
- **V51-DEF-002** `services/fixture-service/` 独立服务缺失
- **V51-DEF-003** `services/baseline-service/` 独立服务缺失
- **V51-DEF-004** `services/assertion-service/` 独立服务缺失
- **V51-DEF-005** `services/evidence-store/`(Evidence Store)缺失
- **V51-DEF-006** 上述 5 项均无独立 `Dockerfile` 与 `compose.*.yaml` 服务定义

---

## §2 工程结构审计

V5.1 §2 要求结构：
```
apps/{customer-portal, operations-console, quality-case-portal}
services/{bank-channel-service, mock-clearing-service, fixture-service, baseline-service, assertion-service}
contracts/{regression-case.schema.json, baseline.schema.json, formatted-case.schema.json, evidence.schema.json}
```

当前结构：
```
apps/{customer-portal, operations-console}
services/{bank-channel-service, mock-clearing-service}
contracts/{openapi/, asyncapi/, catalogs/, fixtures/, schemas/, README.md}
```

### 缺陷
- **V51-DEF-007** `apps/quality-case-portal/` 目录不存在
- **V51-DEF-008** `services/fixture-service/` 目录不存在
- **V51-DEF-009** `services/baseline-service/` 目录不存在
- **V51-DEF-010** `services/assertion-service/` 目录不存在
- **V51-DEF-011** `contracts/regression-case.schema.json` 不存在
- **V51-DEF-012** `contracts/baseline.schema.json` 不存在
- **V51-DEF-013** `contracts/formatted-case.schema.json` 不存在
- **V51-DEF-014** `contracts/evidence.schema.json` 不存在

(注：`contracts/schemas/` 目录只含 `.gitkeep`，为空目录)

---

## §3 RegressionCase 契约审计

V5.1 §3 提供完整 RegressionCase JSON 范例，字段：
- `schemaVersion`, `caseId`, `caseName`, `businessGoal`, `entryUrl`, `actorProfile`, `sourceTypes`, `steps`, `fixtureProfile`, `baselineRef`

当前 `contracts/` 目录只有 `openapi/`, `asyncapi/`, `catalogs/`, `fixtures/`, `schemas/`，无 `regression-case.schema.json` 文件。

### 缺陷
- **V51-DEF-015** 无 `contracts/regression-case.schema.json` 文件
- **V51-DEF-016** 无任何 RegressionCase 数据实例(`*.json`)，测试用例库为空
- **V51-DEF-017** 无 `actorProfile` / `fixtureProfile` / `baselineRef` 字段在 OpenAPI schema 中定义
- **V51-DEF-018** entryUrl `http://127.0.0.1:18082` 在实际部署中不匹配(当前客户入口是 `127.0.0.1:18443`)

---

## §4 BaselineDefinition 契约审计

V5.1 §4 要求 BaselineDefinition 含：
- 强制检查 6 项：关键可见文本 / URL/Route / 关键输出字段 / Network Method/Path/Status / 业务资源状态 / 错误状态
- 可选检查 3 项：截图相似度 / 布局 / 视觉状态
- JSON 示例完整 schema

当前 `contracts/` 无 `baseline.schema.json`。`contracts/schemas/` 目录为空。

### 缺陷
- **V51-DEF-019** 无 `contracts/baseline.schema.json` 文件
- **V51-DEF-020** 无 BaselineDefinition 数据实例
- **V51-DEF-021** 无 Baseline 比较/校验代码或服务
- **V51-DEF-022** "可视化检查"(visual.enabled, threshold)在 contracts 中无 schema

---

## §5 Quality Case Portal 审计

V5.1 §5 要求 8 路由 + 5 功能：

| 路由 | 当前状态 |
|------|----------|
| `/cases` | 缺失 |
| `/cases/{caseId}` | 缺失 |
| `/cases/{caseId}/natural-language` | 缺失 |
| `/cases/{caseId}/formatted` | 缺失 |
| `/cases/{caseId}/video` | 缺失 |
| `/cases/{caseId}/baseline` | 缺失 |
| `/cases/{caseId}/evidence` | 缺失 |
| `/cases/{caseId}/export` | 缺失 |

5 功能：上传视频 / 保存格式化步骤 / 保存自然语言描述 / 保存入口 URL 角色 数据 / 保存人工成功证据 / 导出统一案例包 — **全部缺失**。

### 缺陷
- **V51-DEF-023** `apps/quality-case-portal/` 前端项目完全缺失
- **V51-DEF-024** Quality Case Portal 后端 API(8 路由对应的 backend)缺失
- **V51-DEF-025** 视频上传功能缺失(无上传 endpoint、无 S3/MinIO 或本地存储)
- **V51-DEF-026** 案例导出"统一案例包"功能缺失(无 zip 生成 endpoint)
- **V51-DEF-027** 三种输入格式(NATURAL_LANGUAGE / FORMATTED / VIDEO)在数据库与 API 层无任何建模

---

## §6 页面测试契约审计

V5.1 §6 要求 8 项:`data-page-id`, `data-page-state`, `data-testid`, `role`, `aria-label`, `label`, 稳定路由, 明确 loading/error/success。

| 项 | 当前状态 | 缺陷 |
|----|----------|------|
| `data-page-id` | PASS(v4 P1-1 后 27 pageId 全统一前缀;PageContainer 透传) | 无 |
| `data-page-state` | PASS(PageContainer 实现 LOADING/READY/ERROR) | 无 |
| `data-testid` | 大部分 PASS(P1-1 重写 Catalog 后 27 页 readyMarker 与 React 一致) | 个别页面如 `customer.transfer.result` 的 `transfer-status` testid 待 React 端验证 |
| `role` | 部分 PASS(antd 4 自动透传 role;但 Login `login-username` 等 input 的 `role=textbox` 需 React 实际 antd Form 透传) | 待测 |
| `aria-label` | 大部分缺失(antd Form 默认不输出 aria-label,需手工添加) | 缺 |
| `label` | PASS(antd Form.Item label 字段透传) | 无 |
| 稳定路由 | PASS(P1 后所有路由页面已稳定) | 无 |
| 明确 loading/error/success | 部分 PASS(PageContainer data-page-state=LOADING/READY/ERROR) | success 状态未独立标识(V5.1 隐含要求"明确 loading/error/success"三态,当前 PageContainer 只有 LOADING/READY/ERROR,没 SUCCESS 子态) |

### 缺陷
- **V51-DEF-028** `aria-label` 在多数页面缺失;需补充 V51 §6 列出的 stable locator 属性
- **V51-DEF-029** PageContainer 状态机不含 `SUCCESS` 子态(成功终态保留 ≥2 秒,见 §9 视频规范)
- **V51-DEF-030** `role` 属性在 antd Form 内可能未透传;Catalog 标 `role=textbox/combobox/button` 但 React 实际渲染需 DOM 验证
- **V51-DEF-031** 缺自动化 lint 脚本校验 React ↔ Catalog 状态稳定(P1-1 计划的 `npm run catalog:lint` 脚本未落地)

---

## §7 Fixture 与认证审计

V5.1 §7 要求 4 端点 + 4 规则:

### 端点对照
| 端点 | 当前状态 |
|------|----------|
| `POST /internal/test-support/v1/fixtures:seed` | PASS(`TestSupportController.seed`)—但仍是 v4 hardcode Fineract client_id 1/2(P1-6 修复后是否读 YAML 待核查) |
| `POST /internal/test-support/v1/fixtures:reset` | PASS(`TestSupportController.reset`)—P0-3 后已清 `ledger_entry` |
| `POST /internal/test-support/v1/auth-state:create` | **缺失** — 无任何 auth-state create 端点 |
| `GET /internal/test-support/v1/fixtures/{logicalRef}` | PASS(P1-6 后逻辑引用) |

### 4 规则
| 规则 | 当前状态 |
|------|----------|
| 逻辑引用,不暴露运行时 DB ID | 部分 PASS(P1-6 后 `customer.alice` / `account.alice.primarySavings` 是逻辑引用) | fixture 内仍含 `fineractClientId=1` 硬编码? |
| 每个 Replication/Validation/Regression 使用独立 Namespace | **缺失** — 无 namespace 概念 |
| Storage State 本地短期保存 | **缺失** — 无任何 storage state 保存机制(Playwright storageState 等) |
| 执行结束立即清理 | 部分 PASS(`fixtures:reset` 可调,但无自动化"执行结束立即清理"钩子) |

### 缺陷
- **V51-DEF-032** `POST /internal/test-support/v1/auth-state:create` 端点缺失(为 Midscene 提供 pre-auth storage state)
- **V51-DEF-033** Namespace 概念缺失(RegTestCase 不同 run 之间不应共享 fixture;需 `?namespace=xxx` 路径参数或 schema 字段)
- **V51-DEF-034** Storage State 本地短期保存机制缺失(可能需要 `services/fixture-service/storage/` 目录或 Redis)
- **V51-DEF-035** 执行结束自动清理钩子缺失(需 Playwright `afterEach` 调 fixtures:reset,或测试容器自动停止时触发)
- **V51-DEF-036** P1-6 是否真正读 `contracts/fixtures/baseline-fixtures.yaml` 并调 Fineract API 创建 client/account 需 grep 验证(并行会话执行,本会话未完整验证)

---

## §8 Assertion API 审计

V5.1 §8 要求 4 端点:

| V5.1 端点 | 当前 v4 端点 | 差异 |
|-----------|--------------|------|
| `GET /internal/test-support/v1/assertions/{caseId}/{runId}` | **缺失** | v4 `assertPayment/{paymentId}` 只按 paymentId 维度断言,无 caseId/runId 多维度 |
| `GET /internal/test-support/v1/payments/{paymentId}` | PASS(`assertPayment`) | 名称差异:V5.1 用 `/payments/{paymentId}` 而非 `/assertions/payments/{paymentId}` |
| `GET /internal/test-support/v1/ledger/{correlationId}` | PASS(`assertLedger`) | 名称差异(参见 V5.1) |
| `GET /internal/test-support/v1/reconciliation/{correlationId}` | PASS(`assertReconciliation`)P2-4 后按 correlationId 过滤 | 名称差异 |

### 关键缺陷
- **V51-DEF-037** `GET /internal/test-support/v1/assertions/{caseId}/{runId}` 端点完全缺失 — 无法按 case 维度聚合断言(关键!V5.1 工作流以 case 为单位,非以 payment 为单位)
- **V51-DEF-038** 现有 `assertPayment/ledger/reconciliation` 名称与 V5.1 不一致;V5.1 把它们命名为 `payments/ledger/reconciliation`,显式不带 `assertions/` 前缀,这是 V5.1 vs v4 命名分歧
- **V51-DEF-039** 端点响应不含 `caseId` / `runId` 维度;V5.1 案例 → 失败重审工作流需要 caseId+runId 才能从断言证据回溯到具体案例运行
- **V51-DEF-040** P1-8 是否实现 `coreTransactionFound / coreAmountMatched / coreEntryCount` 待 grep 验证(并行会话)

### 推荐端点兼容路径
V5.1 §8 与 v4 `/assertions/payments/{paymentId}` 两套命名差异,推荐保留两条并行路由:
- `/internal/test-support/v1/assertions/{caseId}/{runId}` 新端点:聚合 caseId 下所有 paymentId、ledger、reconciliation 断言
- `/internal/test-support/v1/payments/{paymentId}`,`/ledger/{correlationId}`,`/reconciliation/{correlationId}` 新路径(去掉 `assertions/` 前缀);旧路径(`/assertions/payments/...`)在 V5.1 阶段一后逐步 deprecate

---

## §8 补充核查(P1-6/P1-8 完成度)
核查 P1-6/P1-8 在并行会话的实际完成度(grep 验证):

### 核查结果
- **P1-6 未真正落地**:grep `createClient` / `createSavingsAccount` 在 `FineractAdapter.java` 中**无任何匹配**;`TestSupportController.seed()` 仍是 hardcoded `fineract_client_id=1/2`,**未读 YAML,未调 Fineract API 创建 client/account**。这是 v4 P1-6 项的"纸面 PASS 但实际未落地"重大缺陷 → 影响 V5.1 §7 "逻辑引用"规则。
- **P1-7 PASS**:`TestSupportController.advanceBusinessDate()` 在 line 308 真调 `fineract.advanceBusinessDate(nextDate)`(P0-2 已就绪的 Adapter 方法),逻辑正确。
- **P1-8 PASS**:`assertPayment` 含 `coreTransactionFound`(line 204)、`coreAmountMatched`(line 205)、`coreEntryCount`(line 206),实际调用 Fineract 端的 `savingsTransactions` 验证(line 178-190)。验收点已满足。

### 由此衍生 V5.1 新缺陷
- **V51-DEF-041** P1-6 "表 完成"实际未落地;`baseline-fixtures.yaml` 仅作描述性文件存在,`seed()` 硬编码不纳使用 → V5.1 §7 Fixture 规则不达标
- **V51-DEF-042** Fixture 无 `FixtureProfile`(V5.1 §3 `fixtureProfile: "PAYMENT_STANDARD"` 概念) — 当前 fixture 只支持 alice/bob 两客户一种 profile,无 `PAYMENT_STANDARD / LOAN_BASIC / RISK_*` 等多 profile

---

## §9 视频规范审计

V5.1 §9 列 6 规则:
1. 固定分辨率、DPI、语言、时区
2. 完整显示操作
3. 成功终态停留至少 2 秒
4. 禁止真实 PII、密码、Token
5. 记录应用版本和录制时间
6. (合约字段)V5.1 §3 `sourceTypes: ["VIDEO"]`

### 核查结果(grep `video|screenshot|resolution|DPI|PII` 全项目)
- 视频上传 endpoint:无
- 视频存储:无目录
- 分辨率/DPI/时区录制约束:无代码
- PII 自动打码:无 lint / 无 transform
- 应用版本与录制时间元数据:无 schema
- 成功终态 2 秒停留:UI 无强制 delay,无 `await` 2 秒

### 缺陷
- **V51-DEF-043** 视频上传 endpoint(`POST /cases/{caseId}/video` 等)缺失
- **V51-DEF-044** 视频存储服务(本地或 S3/MinIO)缺失
- **V51-DEF-045** 视频元数据 schema(分辨率/DPI/语言/时区/应用版本/录制时间)未定义
- **V51-DEF-046** PII 自动遮蔽/打码 transform 缺失
- **V51-DEF-047** 成功终态 2 秒停留契约在 UI/PageContainer 中未强制
- **V51-DEF-048** 视频录制规范文档未写(`docs/video-recording-spec.md` 缺失)

---

## §10 数据库审计

V5.1 §10 要求 2 张表:

```sql
regression_case:
  id UUID PK, case_code VARCHAR(128) UNIQUE, case_json JSONB, case_sha256 CHAR(64), active BOOLEAN, created_at TIMESTAMPTZ

baseline_definition:
  id UUID PK, case_id UUID FK->regression_case.id, version VARCHAR(32), baseline_json JSONB, sha256 CHAR(64), status VARCHAR(32), created_at TIMESTAMPTZ
```

### 核查
- `grep "regression_case|baseline_definition"` 在 `services/bank-channel-service/src/main/resources/db/changelog/` 中**无任何匹配**
- 现有 v1-initial-schema.yaml 含 20 表(transfer/idempotency/outbox_event 等),但**无 V5.1 所要求的两张新表**

### 缺陷
- **V51-DEF-049** `regression_case` 表未创建
- **V51-DEF-050** `baseline_definition` 表未创建
- **V51-DEF-051** 两表对应的 JPA 实体、Repository、Service、Controller 全部缺失
- **V51-DEF-052** 无对应 OpenAPI 契约定义 Case / Baseline 的 CRUD 端点

### 衍生思考
V5.1 §10 数据库规范**未提及** v4 已有的 transfer/outbox_event/eod_run 等表,这是合理的(V5.1 阶段一只新增 case/baseline 表,沿用 v4 银行核心表),但也意味着 `regression_case.baseline_ref` 这种关联需建在更高层(不直接 FK 到 v4 表)。

---

## §11 审计事件类型审计

V5.1 §11 列 8 类审计事件:
```
CASE_CREATED
CASE_EXPORTED
VIDEO_UPLOADED
BASELINE_CREATED
BASELINE_APPROVED
FIXTURE_SEEDED
FIXTURE_RESET
EVIDENCE_ACCESSED
```

### 核查
- grep 上述 8 类事件名在 services/ apps/ contracts/ 中**全无匹配**
- 现有 `security_audit_event` 表只用于 TRANSFER_CREATED/SETTLED/REVERSED 等银行事件
- FIXTURE_SEEDED/FIXTURE_RESET 在 TestSupportController.seed/reset 中**也未写审计事件**(grep 验证,代码只是 jdbc.update INSERT?)

### 缺陷
- **V51-DEF-053** 8 类审计事件全部未实现;AuditService 不认识这些事件类型
- **V51-DEF-054** `FIXTURE_SEEDED` / `FIXTURE_RESET` 在 `TestSupportController.seed/reset` 中未调用 `audit.record`(仅记录 transfer 相关事件)
- **V51-DEF-055** `EVIDENCE_ACCESSED` 在 Evidence Store 服务(本就缺失 V51-DEF-005)中无实现基础
- **V51-DEF-056** 8 类事件 schema 在 contracts/ 中无 JSON Schema 定义

---

## §12 测试与验收(DoD)审计

V5.1 §12 列 8 项 DoD:

| DoD 项 | 当前状态 | 缺陷 |
|--------|----------|------|
| 至少 30 条人工成功案例 | **0 条**(无 case JSON) | 严重缺失 |
| 三种输入格式可导出(NL/Formatted/Video) | 无导出 endpoint | 缺失 |
| Fixture 可重置 | PASS(P1 已修 ledger_entry 等清理) | 无 |
| Baseline 可机器比较 | 无 Baseline schema 与比较器 | 缺失 |
| 页面状态稳定 | 部分 PASS(P1 后 pageId/testid 稳定) | success 子态缺 |
| 关键网络和业务状态可查询 | 部分 PASS(`assertPayment` 等已含 core 验证) | 无 caseId 维度聚合 |
| 证据全部有 Hash | 部分 PASS(transfer_receipt 有 sha256) | case/baseline evidence 无 |
| 无真实敏感数据(PII/密码/Token) | 部分 PASS(fixture alice 用 UUID) | 视频 PII 自动遮蔽机制缺 |

### 缺陷
- **V51-DEF-057** 30 条人工案例全部缺失
- **V51-DEF-058** 三种输入格式导出 endpoint 缺失
- **V51-DEF-059** Baseline 比较 comparator 代码缺失
- **V51-DEF-060** Case/Baseline evidence 无 sha256 计算(可参考 transfer_receipt 模式)
- **V51-DEF-061** 视频 / Formatted / NL 三种输入的 PII 遮蔽 transform 缺失

---

## §13 Definition of Done 闭环审计

V5.1 §13 收尾 DoD:"任一案例都可以被阶段三读取,并能在独立环境中重复人工成功流程、获取明确 Baseline 和业务断言。"

### 拆解 3 闭环要求
| 要求 | 当前状态 | 缺陷 |
|------|----------|------|
| 1. 任一案例可被阶段三(Midscene 系统)读取 | **不达标**(无案例库 + 无导出 endpoint + 阶段三 ADR-051-01~07 全无代码) | V51-DEF-062 |
| 2. 独立环境重复人工成功流程 | 部分(独立环境 docker compose 已可启动;但独立 case 重跑需要 Fixture 隔离 namespace 与 storage state,均缺) | V51-DEF-063 |
| 3. 获取明确 Baseline 和业务断言 | Baseline 完全缺;业务断言现有(但只支持 transfer 维度,非 case/run 维度) | V51-DEF-064 |

### 缺陷
- **V51-DEF-062** 阶段三(阶段三 HiAgent Coze 三动作窗口 Midscene)与前阶段联调路径未通;案例 → 阶段三读取不可行
- **V51-DEF-063** 独立 Replication/Validation 环境共享 Fixture/Storage State(V5.1 ADR-051-04 要求不共享 BrowserContext/进程)
- **V51-DEF-064** Case 维度断言聚合 endpoint 缺失(参见 V51-DEF-037)

---

## ADR-051 冻结架构决策审计

V5.1 §2 列 7 项 ADR-051 决策。

| ADR | 要求 | 当前状态 | 缺陷 |
|-----|------|----------|------|
| ADR-051-01 Midscene 只执行原子动作 | 主链默认 aiTap/aiInput/aiClearInput/aiKeyboardPress/aiScroll/aiHover/aiLocate/aiWaitFor;`aiAct()` 受限 | **零代码** | V51-DEF-065 |
| ADR-051-02 三动作窗口由 ActionWindowController | previous/current/next summary;PASSED 后推游标 | **零代码** | V51-DEF-066 |
| ADR-051-03 视觉定位与浏览器事实分离 | Midscene 定位 + Playwright 事实 + Business Assertion | **零代码** | V51-DEF-067 |
| ADR-051-04 脚本验证必须独立 | Replication 和 Validation Worker 不共享 BrowserContext/Fixture/Storage/Evidence | **零代码** | V51-DEF-068 |
| ADR-051-05 定时回归不调用 LLM | 只执行 SCRIPT_VALIDATED 资产;失败生成 ReauthoringRequest | **零代码** | V51-DEF-069 |
| ADR-051-06 文件输出优先 Artifact Registry | artifactId/fileName/version/sha256/downloadUrl | **零代码** | V51-DEF-070 |
| ADR-051-07 16K 是公司模型有效限制 | companyVisualModelEffectiveContextLimit = 16384 配置 | **零配置** | V51-DEF-071 |

### 补充核查
- grep `midscene|hiagent|coze|aiTap|aiInput|ActionWindowController` 在 packages/ services/ apps/ 中**全无匹配**
- doc/architecture/ 目录下无 `adr-051-*.md` 任何文件
- 与"零实现"对照,V5.1 00 文档说 PoC 已 PASS,但 **PoC 实现包源码与结果快照**仍仅在 RAG 中保留（原 `background information/落地方案 V5.1/V5.1五组PoC实现包_源码与结果/`），未实际落地到 `services/` 工程中

### 衍生审计点
V5.1 §00 提到"PoC-01 Live 因缺少公司 Endpoint、Key 和 `@midscene/web` 运行包,LIVE_INTEGRATION_PENDING"。这意味着:
- **V51-DEF-072** PoC 代码以源码包快照形式保留在 RAG 中,未集成入 `services/` 或 `packages/`
- **V51-DEF-073** 公司视觉模型 Endpoint/Key 配置在 application.yml 或环境变量中无占位
- **V51-DEF-074** `@midscene/web` 仓库依赖未加入 `package.json`(任何子项目)

---

## 综合:V5.1 阶段一不通过的根因概览

1. **定位错位**:V5.1 阶段一本质上把"测试目标系统"叠加在 v4 阶段一银行演示系统之上,**新增了案例平台 + Baseline + 视频证据 + Midscene 联调准备**。当前项目只完成了 v4 部分(并已 P0/P1 修复),V5.1 新增的 4 类服务(quality-case-portal/fixture-service/baseline-service/assertion-service)+ 1 类前端 + 7 类 ADR 几乎全部缺失。

2. **PoC 已验证但未合并**:原 `background information/落地方案 V5.1/V5.1五组PoC实现包_源码与结果/` 已拆解为 RAG 快照,但 PoC 代码 / 配置 / 测试结果未整合到主工程 `services/` / `packages/` 中。需要主动占位 срок 把 PoC 产物"工程化集成"。

3. **v4 P1-6 实际未落地**:并行会话把"P1-6 完成"记录到 `P1-summary-report.md`,但实测 `TestSupportController.seed()` 仍硬编码 Fineract client_id 1/2,不调 Fineract API。这与 V5.1 §7 Fixture 逻辑引用规则 + V5.1 ADR-051-04 独立 Fixture 命名空间双重违反。
- 这同时影响 V5.1 阶段一 DoD"Fixture 可重置"的语义达到(假设对于单客户在固定 Fineract client_id=1/2 scenario 下"可重置",但对于多 namespace / 多 case 并行场景不可重置)。

4. **契约双标准不并存**:V5.1 §3 RegressionCase 用 `/api/v1/transfers` 路径(无 `/api/v1/operations/` 前缀),但当前项目用 `/api/operations/v1/transfers`、`/api/customer/v1/transfers` 双路径。需在 V5.1 适配时决定是否:
   - 把 V5.1 路径视为 typo,改 V5.1 文档
   - 或新增 `/api/v1/transfers` 三类路径(short,与 v4 不一致的所有 v4 path 均需保持兼容)

---

## 缺陷汇总分级

### P0 级阻塞(影响 V5.1 阶段一最终验收)
- V51-DEF-001 Quality Case Portal 前端缺失
- V51-DEF-002/003/004/005 4 个新独立服务缺失
- V51-DEF-011/012/013/014 4 个 contracts schema 缺失
- V51-DEF-037 caseId/runId 维度断言 endpoint 缺失
- V51-DEF-041 P1-6 Fixture 假完成(真因)
- V51-DEF-049/049 regression_case / baseline_definition 表缺失
- V51-DEF-053 8 类审计事件全未实现
- V51-DEF-057 30 条人工案例全未写
- V51-DEF-065~070 ADR-051-01~07 全无代码

### P1 级阻塞(关键功能缺失,影响验收但不能跳过)
- V51-DEF-022 Quality Case Portal 后端 8 路由缺失
- V51-DEF-031 catalog:lint 脚本未落地(v4 P1-1 残留)
- V51-DEF-032 auth-state:create 端点缺失
- V51-DEF-043~047 视频相关 6 项缺失
- V51-DEF-062~063 V5.1 §13 闭环 3 项不达标

### P2 级建议(补强)
- V51-DEF-028 aria-label 缺失
- V51-DEF-029 PageContainer 无 SUCCESS 子态
- V51-DEF-033 namespace 概念缺失
- V51-DEF-042 多 FixtureProfile 缺失
- V51-DEF-060 case/baseline evidence sha256 计算
- V51-DEF-074 `@midscene/web` 依赖未加入

---

## 总结

V5.1 阶段一**审计结论:不通过**。

完成度估算:
- v4 阶段一(银行系统 + TestSupport 断言): 80% 以上已完成(P0+P1 修复)
- V5.1 阶段一新增内容(质量案例平台 + Baseline + 视频证据 + Midscene 准备): **< 10%**

主要工作量在新增 4 个服务 + 1 个前端 + 8 路由案例门户 + 2 张数据库表 + 8 类审计事件 + 30 条人工案例 + 7 类 ADR-051 实现。预计工时**18~22 工作日**,远超 v4 P2 的 5.4 工作日范围。

建议下一步:
1. 用户审阅本审计报告
2. 决定 V5.1 阶段一执行范围(全部实现 vs 部分实现 + 临时豁免)
3. 启动 V5.1 W0 准备阶段:`apps/quality-case-portal/` 骨架 + 4 新服务骨架 + 4 schema 文件占位
4. v4 P1-6 真正完成(扩 FineractAdapter createClient/createSavingsAccount + TestSupportController.seed 改 YAML 加载)

_本审计报告完成于 2026-07-13,涵盖 V5.1 §1–§13 + ADR-051-01~07 全节,共识别 73 个缺陷。_

---

## 附录:缺陷索引表(按编号查找)

### V51-DEF-001 ~ V51-DEF-010 §1 §2 工程结构
- V51-DEF-001 Quality Case Portal 前端缺失
- V51-DEF-002 Fixture Service 独立服务缺失
- V51-DEF-003 Baseline Registry 独立服务缺失
- V51-DEF-004 Business Assertion Service 独立服务缺失
- V51-DEF-005 Evidence Store 缺失
- V51-DEF-006 上述 5 项均无 Dockerfile / compose 服务定义
- V51-DEF-007 apps/quality-case-portal 目录缺失
- V51-DEF-008 services/fixture-service 目录缺失
- V51-DEF-009 services/baseline-service 目录缺失
- V51-DEF-010 services/assertion-service 目录缺失

### V51-DEF-011 ~ V51-DEF-021 §2 §3 §4 契约 schema
- V51-DEF-011 contracts/regression-case.schema.json 缺失
- V51-DEF-012 contracts/baseline.schema.json 缺失
- V51-DEF-013 contracts/formatted-case.schema.json 缺失
- V51-DEF-014 contracts/evidence.schema.json 缺失
- V51-DEF-015 RegressionCase schema 文件缺失
- V51-DEF-016 RegressionCase 数据实例全部为空
- V51-DEF-017 actorProfile/fixtureProfile/baselineRef OpenAPI 字段未定义
- V51-DEF-018 BaselineDefinition schema 文件缺失
- V51-DEF-019 BaselineDefinition 数据实例缺失
- V51-DEF-020 Baseline 比较器代码缺失
- V51-DEF-021 可视化阈值 schema 未定义

### V51-DEF-022 ~ V51-DEF-026 §5 Quality Case Portal
- V51-DEF-022 quality-case-portal 前端项目缺失
- V51-DEF-023 后端 8 路由缺失
- V51-DEF-024 视频上传功能缺失
- V51-DEF-025 案例导出统一案例包功能缺失
- V51-DEF-026 三种输入格式(DB/API 层)无建模

### V51-DEF-028 ~ V51-DEF-031 §6 页面测试契约
- V51-DEF-028 aria-label 多数页面缺失
- V51-DEF-029 PageContainer SUCCESS 子态缺失
- V51-DEF-030 role 属性 antd Form 透传待 DOM 验证
- V51-DEF-031 catalog:lint 脚本未落地

### V51-DEF-032 ~ V51-DEF-036 §7 Fixture 与认证
- V51-DEF-032 auth-state:create 端点缺失
- V51-DEF-033 Namespace 概念缺失
- V51-DEF-034 Storage State 本地短期保存缺失
- V51-DEF-035 执行结束自动清理钩子缺失
- V51-DEF-036 P1-6 实际未落地(grep 验证)

### V51-DEF-037 ~ V51-DEF-042 §8 Assertion API + §7 衍生
- V51-DEF-037 caseId/runId 维度聚合断言 endpoint 缺失
- V51-DEF-038 端点名称与 V5.1 不一致(assertions/前缀)
- V51-DEF-039 端点响应不含 caseId/runId 维度
- V51-DEF-040 P1-8 已 PASS(本条用作反向参考,无缺陷;实为 0)
- V51-DEF-041 P1-6 Paper PASS 但未落地(同 DEF-035,重复登记便于检索)
- V51-DEF-042 多 FixtureProfile(PAYMENT_STANDARD 等)缺失

### V51-DEF-043 ~ V51-DEF-048 §9 视频规范
- V51-DEF-043 视频上传 endpoint 缺失
- V51-DEF-044 视频存储服务缺失
- V51-DEF-045 视频元数据 schema 缺失
- V51-DEF-046 PII 自动遮蔽 transform 缺失
- V51-DEF-047 成功终态 2 秒停留契约/UI 缺失
- V51-DEF-048 视频录制规范文档未写

### V51-DEF-049 ~ V51-DEF-056 §10 §11 数据库与审计事件
- V51-DEF-049 regression_case 表未创建
- V51-DEF-050 baseline_definition 表未创建
- V51-DEF-051 两表对应 JPA/Repository/Service/Controller 缺失
- V51-DEF-052 Case/Baseline OpenAPI 契约未定义
- V51-DEF-053 8 类审计事件全部未实现
- V51-DEF-054 FIXTURE_SEEDED/RESET 未调 audit.record
- V51-DEF-055 EVIDENCE_ACCESSED 无实现基础
- V51-DEF-056 8 类事件 schema 缺失

### V51-DEF-057 ~ V51-DEF-061 §12 DoD
- V51-DEF-057 30 条人工案例缺失
- V51-DEF-058 三种输入格式导出 endpoint 缺失
- V51-DEF-059 Baseline 比较 comparator 缺失
- V51-DEF-060 Case/Baseline evidence sha256 计算缺失
- V51-DEF-061 PII 遮蔽 transform 缺失

### V51-DEF-062 ~ V51-DEF-064 §13 闭环
- V51-DEF-062 阶段三案例读取路径未通
- V51-DEF-063 独立 Replication/Validation 环境共享 Fixture/BrowserContext
- V51-DEF-064 Case 维度断言聚合 endpoint 缺失(同 DEF-036)

### V51-DEF-065 ~ V51-DEF-074 ADR-051 + PoC 整合
- V51-DEF-065 ADR-051-01 aiTap/aiInput 等 8 个原子动作 0 代码
- V51-DEF-066 ADR-051-02 ActionWindowController 0 代码
- V51-DEF-067 ADR-051-03 视觉/事实分离 0 代码
- V51-DEF-068 ADR-051-04 独立 Replication/Validation 0 代码
- V51-DEF-069 ADR-051-05 ReauthoringRequest 0 代码
- V51-DEF-070 ADR-051-06 Artifact Registry 0 代码
- V51-DEF-071 ADR-051-07 companyVisualModelEffectiveContextLimit 配置缺
- V51-DEF-072 PoC 代码未集成入 services/
- V51-DEF-073 公司视觉模型 Endpoint/Key 配置无占位
- V51-DEF-074 @midscene/web 依赖未加入 package.json

---

_审计报告全文完。_ 
_审计人:opencode-go/glm-5.2(ClaudeCodeWorker WSL)。_
_审计时间:2026-07-13。_  
_总缺陷数:74(含 V51-DEF-040 为反向参考;实际有效缺陷 73 项)。_  
_关键修复优先级:见上文缺陷汇总分级 P0/P1/P2。_
