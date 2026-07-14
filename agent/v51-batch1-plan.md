# V5.1 第一批修复方案（银行核心历史计划）

> 状态：历史计划；不得据此声称 v5.4 回归平台已实现。当前银行核心状态以 `AGENTS.md`、`docs/architecture/current-capability-matrix.md` 和审查报告为准。
> 依据：`docs/evidence/v51-audit/audit-report.md` (73 个缺陷) + 已迁移的 v5.1/v5.4 RAG 快照。v5.4 目标与双系统边界见 `docs/architecture/v5.4-external-demo-baseline.md`。
> 仓库：https://github.com/JunyeOvO/banksystem.git
> 分支：agent/publish-banksystem
> 日期：2026-07-13

---

## 0. 架构决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 新增 3 个服务架构 | 独立 Spring Boot 3.4.5 / Java 21 | 完全符合 V5.1 §2 工程结构；各自 pom.xml + Dockerfile + compose 服务定义 |
| v4 修复执行计划 39 Task | 并行推进 | v4 修复与 V5.1 新增工作互不阻塞，双轨并行 |
| PoC 代码包集成 | 第二批 | 等服务骨架就绪后再集成 PoC TypeScript 类型与 ActionWindowController |
| 案例管理后端 | 第一批内嵌 bank-channel-service | 快速落地，第二批再提取为独立服务 |

## 1. 双轨并行结构

```
Track A (V5.1 新增)                    Track B (v4 并行修复)
───────────────────────                ───────────────────────
W1-1  4 个 contract JSON Schema        W1-B1  状态机转换矩阵 (P0-1)
W1-2  2 张 DB 表 Liquibase 迁移         W1-B2  清算超时传播 (P0-2)
W1-3  v4 P1-6 Seed 读 YAML             W1-B3  inbox_event 合规 (P0-3)
W1-4  8 类审计事件扩展                   W1-B4  transfer_order 约束 (P0-4)
W1-5  Quality Case Portal React 骨架    W1-B5  transfer_receipt 类型 (P0-5)
W1-6  Case/Baseline CRUD API
W1-7  fixture-service 骨架
W1-8  baseline-service 骨架
W1-9  assertion-service 骨架
W1-10 Docker Compose 集成
```

两条 Track 无文件级冲突，可完全并行。Track B 全部修改集中在 `bank-channel-service` 的 Java/Liquibase 文件；Track A 新增文件为主，仅 W1-3/W1-4 修改 `bank-channel-service` 中已有的 `FineractAdapter`/`AuditService`/`TestSupportController`。

---

## 2. Track A：V5.1 新增工作

### W1-1: 4 个 Contract JSON Schema

**对应缺陷**: V51-DEF-011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021

**新建文件**:

| 文件路径 | 内容 |
|----------|------|
| `contracts/regression-case.schema.json` | RegressionCase JSON Schema (Draft 2020-12) |
| `contracts/baseline.schema.json` | BaselineDefinition JSON Schema |
| `contracts/formatted-case.schema.json` | 格式化步骤 JSON Schema |
| `contracts/evidence.schema.json` | 证据 JSON Schema |

**regression-case.schema.json 字段** (来自 V5.1 §3):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "regression-case.schema.json",
  "title": "RegressionCase",
  "type": "object",
  "required": ["schemaVersion", "caseId", "caseName", "businessGoal", "entryUrl", "actorProfile", "sourceTypes", "steps", "fixtureProfile", "baselineRef"],
  "properties": {
    "schemaVersion": { "type": "string", "const": "1.0" },
    "caseId": { "type": "string", "pattern": "^REG-[A-Z]+-\\d{3}$" },
    "caseName": { "type": "string", "minLength": 1, "maxLength": 128 },
    "businessGoal": { "type": "string", "minLength": 1, "maxLength": 500 },
    "entryUrl": { "type": "string", "format": "uri" },
    "actorProfile": { "type": "string", "pattern": "^(customer|operations)\\." },
    "sourceTypes": {
      "type": "array",
      "items": { "enum": ["NATURAL_LANGUAGE", "FORMATTED", "VIDEO"] },
      "minItems": 1,
      "uniqueItems": true
    },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["sequence", "description"],
        "properties": {
          "sequence": { "type": "integer", "minimum": 1 },
          "description": { "type": "string", "minLength": 1, "maxLength": 500 }
        }
      },
      "minItems": 1
    },
    "fixtureProfile": { "type": "string", "enum": ["PAYMENT_STANDARD", "LOAN_BASIC", "RISK_STANDARD", "CLEARING_STANDARD", "EOD_STANDARD"] },
    "baselineRef": { "type": "string", "pattern": "^BASE-[A-Z]+-\\d{3}$" }
  }
}
```

**baseline.schema.json 字段** (来自 V5.1 §4):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "baseline.schema.json",
  "title": "BaselineDefinition",
  "type": "object",
  "required": ["baselineId", "required"],
  "properties": {
    "baselineId": { "type": "string", "pattern": "^BASE-[A-Z]+-\\d{3}$" },
    "required": {
      "type": "object",
      "required": ["visibleTexts", "urlPattern", "outputs", "network", "businessState"],
      "properties": {
        "visibleTexts": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "urlPattern": { "type": "string" },
        "outputs": { "type": "array", "items": { "type": "string" } },
        "network": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["method", "pathPattern", "status"],
            "properties": {
              "method": { "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"] },
              "pathPattern": { "type": "string" },
              "status": { "type": "integer", "minimum": 100, "maximum": 599 }
            }
          }
        },
        "businessState": { "type": "string" }
      }
    },
    "visual": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean", "default": false },
        "threshold": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.9 }
      }
    }
  }
}
```

**formatted-case.schema.json**: 格式化步骤，每步含 sequence/action/target/valueRef/expectedLocator

**evidence.schema.json**: 证据包，含 evidenceId/caseId/runId/type(VIDEO|TRACE|NETWORK)/sha256/metadata

**验收标准**:
- `ajv compile` 全部 4 个 schema 通过
- V5.1 §3 的 RegressionCase JSON 范例通过 `regression-case.schema.json` 验证
- V5.1 §4 的 BaselineDefinition JSON 范例通过 `baseline.schema.json` 验证

---

### W1-2: 2 张 DB 表 Liquibase 迁移

**对应缺陷**: V51-DEF-049, 050

**新建文件**: `services/bank-channel-service/src/main/resources/db/changelog/v4-v51-case-baseline.yaml`

**changeset 内容** (来自 V5.1 §10):

```yaml
databaseChangeLog:
  - changeSet:
      id: v4-v51-create-regression-case
      author: v51-batch1
      changes:
        - createTable:
            tableName: regression_case
            columns:
              - column: { name: id, type: uuid, constraints: { primaryKey: true, nullable: false } }
              - column: { name: case_code, type: varchar(128), constraints: { nullable: false, unique: true } }
              - column: { name: case_json, type: jsonb, constraints: { nullable: false } }
              - column: { name: case_sha256, type: char(64), constraints: { nullable: false } }
              - column: { name: active, type: boolean, defaultValueBoolean: true, constraints: { nullable: false } }
              - column: { name: created_at, type: timestamptz, defaultValueComputed: now(), constraints: { nullable: false } }
        - createIndex:
            indexName: idx_regression_case_code
            tableName: regression_case
            columns: [{ column: case_code }]
        - createIndex:
            indexName: idx_regression_case_active
            tableName: regression_case
            columns: [{ column: active }, { column: created_at }]

  - changeSet:
      id: v4-v51-create-baseline-definition
      author: v51-batch1
      changes:
        - createTable:
            tableName: baseline_definition
            columns:
              - column: { name: id, type: uuid, constraints: { primaryKey: true, nullable: false } }
              - column: { name: case_id, type: uuid, constraints: { nullable: false, foreignKeyName: fk_baseline_case, references: regression_case(id) } }
              - column: { name: version, type: varchar(32), constraints: { nullable: false } }
              - column: { name: baseline_json, type: jsonb, constraints: { nullable: false } }
              - column: { name: sha256, type: char(64), constraints: { nullable: false } }
              - column: { name: status, type: varchar(32), constraints: { nullable: false } }
              - column: { name: created_at, type: timestamptz, defaultValueComputed: now(), constraints: { nullable: false } }
        - createIndex:
            indexName: idx_baseline_case_id
            tableName: baseline_definition
            columns: [{ column: case_id }, { column: version }]
```

**修改文件**: `services/bank-channel-service/src/main/resources/db/changelog/db.changelog-master.yaml`
- 新增 `include: v4-v51-case-baseline.yaml`

**验收标准**:
- `databasechangelog` 表新增 2 条记录
- `\d regression_case` 和 `\d baseline_definition` 表结构匹配 V5.1 §10
- `baseline_definition.case_id` 外键引用 `regression_case.id`

---

### W1-3: v4 P1-6 真正落地 - Seed 读 YAML

**对应缺陷**: V51-DEF-036, 041, 042

**修改文件**:

| 文件 | 修改内容 |
|------|----------|
| `FineractAdapter.java` | 新增 `createClient(String displayName)` -> POST `/api/v1/clients`；新增 `createSavingsAccount(Long clientId, Integer productId, String currency)` -> POST `/api/v1/savingsaccounts` |
| `TestSupportController.java` | `seed()` 方法重写：读取 `contracts/fixtures/baseline-fixtures.yaml`，按 logicalRef 调 `FineractAdapter.createClient/createSavingsAccount` 创建真实 Fineract 资源，写入 `customer_identity` 表，返回运行时 ID |
| `baseline-fixtures.yaml` | 补充 `fineractProductId` 字段 (从 application.yml `fineract.savings-product-id` 读取) |
| `application.yml` | 新增 `fineract.savings-product-id` 配置项 |

**当前缺陷**: `TestSupportController.seed()` 硬编码 `fineract_client_id=1/2`，不调 Fineract API，不读 YAML。`FineractAdapter` 无 `createClient`/`createSavingsAccount` 方法。

**修复后行为**:
1. `seed()` 读取 `baseline-fixtures.yaml` 中的 `customer.alice` 和 `customer.bob`
2. 对每个 customer 调用 `FineractAdapter.createClient(displayName)` 获取真实 `clientId`
3. 对每个 account 调用 `FineractAdapter.createSavingsAccount(clientId, productId, currency)` 获取真实 `accountId`
4. 写入 `customer_identity(subject, fineract_client_id)` 表
5. 返回 Map: `{"customer.alice": {"subject": "fixture-alice-<uuid>", "fineractClientId": 123, "accountId": 456}, ...}`

**验收标准**:
- `seed()` 后 `customer_identity` 表 `fineract_client_id` 不是硬编码 1/2，而是 Fineract 返回的真实 ID
- `getFixture("customer.alice")` 返回运行时 subject 和 fineractClientId
- `getFixture("account.alice.primarySavings")` 返回运行时 accountId
- 重复调 `seed()` 不创建重复 Fineract 资源 (幂等)

---

### W1-4: AuditService 扩展 8 类审计事件

**对应缺陷**: V51-DEF-053, 054

**修改文件**:

| 文件 | 修改内容 |
|------|----------|
| `AuditService.java` | 新增 8 个事件类型常量：`CASE_CREATED`, `CASE_EXPORTED`, `VIDEO_UPLOADED`, `BASELINE_CREATED`, `BASELINE_APPROVED`, `FIXTURE_SEEDED`, `FIXTURE_RESET`, `EVIDENCE_ACCESSED` |
| `TestSupportController.java` | `seed()` 末尾调用 `audit.record("FIXTURE_SEEDED", "SYSTEM", "test-support", "Fixture", "all", "SEED", "SUCCESS", null, Map.of())`；`reset()` 末尾调用 `audit.record("FIXTURE_RESET", "SYSTEM", "test-support", "Fixture", "all", "RESET", "SUCCESS", null, Map.of())` |

**当前缺陷**: `TestSupportController.seed/reset` 不写审计事件。AuditService 只认识 TRANSFER_* 事件。

**验收标准**:
- `seed()` 后 `security_audit_event` 表有 `FIXTURE_SEEDED` 记录
- `reset()` 后 `security_audit_event` 表有 `FIXTURE_RESET` 记录
- 哈希链连续 (previous_hash -> record_hash)

---

### W1-5: Quality Case Portal React 骨架

**对应缺陷**: V51-DEF-001, 007, 022, 023, 026

**新建目录**: `apps/quality-case-portal/`

**文件结构** (参照 customer-portal / operations-console 模式):

```
apps/quality-case-portal/
├── package.json          # react/react-dom/react-router-dom/antd/@tanstack/react-query/zod
├── vite.config.ts       # base: /qcp/, proxy /api -> http://127.0.0.1:18443, @ alias
├── tsconfig.json        # strict: true, noUncheckedIndexedAccess, noUnusedLocals
├── index.html           # lang="zh-CN", <div id="root">
├── Dockerfile           # multi-stage: node build + nginx:1.27-alpine serve
├── nginx.conf           # SPA fallback to index.html
└── src/
    ├── main.tsx         # BrowserRouter(basename="/qcp"), QueryClientProvider, ConfigProvider
    ├── App.tsx          # antd Layout + Sider Menu + 8 routes
    ├── components/
    │   └── PageContainer.tsx   # data-page-id, data-page-state(LOADING|READY|ERROR), aria-busy
    ├── pages/
    │   ├── CaseList.tsx              # /cases - 案例列表
    │   ├── CaseDetail.tsx            # /cases/:caseId - 案例详情
    │   ├── NaturalLanguage.tsx      # /cases/:caseId/natural-language - 自然语言描述
    │   ├── Formatted.tsx            # /cases/:caseId/formatted - 格式化步骤
    │   ├── VideoUpload.tsx          # /cases/:caseId/video - 视频上传
    │   ├── Baseline.tsx             # /cases/:caseId/baseline - Baseline 定义
    │   ├── Evidence.tsx             # /cases/:caseId/evidence - 证据查看
    │   └── Export.tsx               # /cases/:caseId/export - 导出案例包
    ├── api/
    │   └── client.ts       # apiClient (get/post/put/delete + Bearer token)
    └── types/
        └── models.ts       # RegressionCase, BaselineDefinition, Evidence 等接口
```

**V5.1 §5 要求的 8 路由**:

| 路由 | pageId | 功能 |
|------|--------|------|
| `/cases` | `qcp.cases` | 案例列表 |
| `/cases/:caseId` | `qcp.case.detail` | 案例详情 |
| `/cases/:caseId/natural-language` | `qcp.case.natural-language` | 自然语言描述 |
| `/cases/:caseId/formatted` | `qcp.case.formatted` | 格式化步骤 |
| `/cases/:caseId/video` | `qcp.case.video` | 视频上传 |
| `/cases/:caseId/baseline` | `qcp.case.baseline` | Baseline 定义 |
| `/cases/:caseId/evidence` | `qcp.case.evidence` | 证据查看 |
| `/cases/:caseId/export` | `qcp.case.export` | 导出案例包 |

**验收标准**:
- `npm run build` 通过 (tsc + vite build)
- 8 路由均可访问 (占位内容)
- 每个页面使用 `PageContainer` 含 `data-page-id` 和 `data-page-state`
- 所有交互元素有 `data-testid`
- TypeScript strict mode 零错误

---

### W1-6: Case/Baseline CRUD API + OpenAPI 契约

**对应缺陷**: V51-DEF-051, 052

**新建文件**:

| 文件 | 内容 |
|------|------|
| `contracts/openapi/case-api.yaml` | OpenAPI 3.1.1 定义 Case/Baseline CRUD 端点 |
| `bank-channel-service/.../case/CaseController.java` | Case CRUD Controller |
| `bank-channel-service/.../case/CaseService.java` | Case Service (JdbcTemplate) |
| `bank-channel-service/.../case/BaselineController.java` | Baseline CRUD Controller |
| `bank-channel-service/.../case/BaselineService.java` | Baseline Service (JdbcTemplate + comparator) |

**API 端点**:

| 端点 | 方法 | 说明 | 审计事件 |
|------|------|------|----------|
| `/api/v1/cases` | GET | 列出所有 regression_case | - |
| `/api/v1/cases` | POST | 创建案例 (校验 JSON Schema, 写 regression_case, 计算 sha256) | CASE_CREATED |
| `/api/v1/cases/{caseId}` | GET | 获取案例详情 | - |
| `/api/v1/cases/{caseId}` | PUT | 更新案例 | - |
| `/api/v1/cases/{caseId}/export` | GET | 导出统一案例包 (JSON + baseline + evidence sha256) | CASE_EXPORTED |
| `/api/v1/baselines` | POST | 创建 baseline (写 baseline_definition, 计算 sha256) | BASELINE_CREATED |
| `/api/v1/baselines/{baselineId}` | GET | 获取 baseline | - |
| `/api/v1/baselines/{baselineId}/approve` | POST | 审批 baseline (status -> APPROVED) | BASELINE_APPROVED |

**SecurityConfig 新增规则**:
```java
.requestMatchers("/api/v1/cases/**").hasAnyAuthority("ROLE_SYSTEM_ADMIN", "ROLE_AUDITOR")
.requestMatchers("/api/v1/baselines/**").hasAnyAuthority("ROLE_SYSTEM_ADMIN", "ROLE_AUDITOR")
```

**case_sha256 计算逻辑**:
```java
String sha256 = sha256(mapper.writeValueAsString(regressionCaseJson));
```

**Baseline comparator** (在 BaselineService 中):
```java
public BaselineCompareResult compare(UUID baselineId, String actualVisibleText, String actualUrl, String actualBusinessState) {
    BaselineDefinition def = findById(baselineId);
    return BaselineCompareResult.builder()
        .visibleTextMatch(def.getRequired().getVisibleTexts().stream().allMatch(actualVisibleText::contains))
        .urlMatch(actualUrl.matches(def.getRequired().getUrlPattern()))
        .businessStateMatch(def.getRequired().getBusinessState().equals(actualBusinessState))
        .build();
}
```

**验收标准**:
- POST `/api/v1/cases` 返回 201 + caseId
- GET `/api/v1/cases/{caseId}` 返回案例 JSON
- GET `/api/v1/cases/{caseId}/export` 返回统一案例包
- POST `/api/v1/baselines` 返回 201 + baselineId
- 创建/导出/审批操作写审计事件
- case_json 和 baseline_json 的 sha256 正确计算

---

### W1-7: fixture-service 独立 Spring Boot 服务骨架

**对应缺陷**: V51-DEF-002, 008

**新建目录**: `services/fixture-service/`

```
services/fixture-service/
├── pom.xml              # spring-boot-starter-web/jdbc/security, postgresql, actuator, micrometer-prometheus
├── Dockerfile           # multi-stage: maven build + eclipse-temurin:21-jre
└── src/main/
    ├── java/cn/localbank/fixture/
    │   ├── FixtureServiceApplication.java
    │   ├── FixtureController.java       # seed, reset, getFixture, auth-state:create
    │   ├── FixtureService.java           # YAML 加载, Fineract API 调用, namespace 隔离
    │   └── SecurityConfig.java           # OAuth2 JWT, ROLE_TEST_SUPPORT
    └── resources/
        ├── application.yml               # 端口 18090, datasource, fineract 配置
        └── db/changelog/                 # fixture-service 专属表 (如需要)
```

**端点** (V5.1 §7 + v4 现有):

| 端点 | 方法 | 说明 | 来源 |
|------|------|------|------|
| `/internal/test-support/v1/fixtures:seed` | POST | 播种测试数据 (读 YAML, 调 Fineract) | 从 bank-channel-service 迁移 + W1-3 增强 |
| `/internal/test-support/v1/fixtures:reset` | POST | 清理测试数据 | 从 bank-channel-service 迁移 |
| `/internal/test-support/v1/fixtures/{logicalRef}` | GET | 查询 fixture 运行时 ID | 从 bank-channel-service 迁移 |
| `/internal/test-support/v1/auth-state:create` | POST | 创建认证状态 (storage state) | **新增** V51-DEF-032 |

**auth-state:create 实现**:
```java
@PostMapping("/internal/test-support/v1/auth-state:create")
public Map<String, Object> createAuthState(@RequestBody AuthStateRequest req) {
    // 调用 Keycloak token endpoint 获取 access_token
    // 返回 {"storageState": {...}, "expiresIn": 300}
}
```

**与 bank-channel-service 的关系**:
- bank-channel-service 的 `TestSupportController` 保留 (向后兼容)
- fixture-service 独立部署，未来 bank-channel-service 的 TestSupportController 可逐步 deprecate
- 两者共享 `bank_channel` 数据库

**验收标准**:
- `mvn package` 通过
- `docker compose up` 后 fixture-service 容器 healthy
- `POST /fixtures:seed` 返回真实 Fineract ID (非硬编码)
- `POST /auth-state:create` 返回 storage state

---

### W1-8: baseline-service 独立 Spring Boot 服务骨架

**对应缺陷**: V51-DEF-003, 009, 020, 021

**新建目录**: `services/baseline-service/`

```
services/baseline-service/
├── pom.xml
├── Dockerfile
└── src/main/
    ├── java/cn/localbank/baseline/
    │   ├── BaselineServiceApplication.java
    │   ├── BaselineController.java       # CRUD + approve
    │   ├── BaselineService.java           # JdbcTemplate + comparator
    │   └── SecurityConfig.java
    └── resources/
        └── application.yml               # 端口 18091, datasource
```

**端点** (从 W1-6 迁移):

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/baselines` | POST | 创建 baseline |
| `/api/v1/baselines/{baselineId}` | GET | 获取 baseline |
| `/api/v1/baselines/{baselineId}/approve` | POST | 审批 baseline |
| `/api/v1/baselines/{baselineId}/compare` | POST | 机器比较 (输入实际值, 返回匹配结果) |

**Baseline comparator 逻辑**:
```java
public BaselineCompareResult compare(UUID baselineId, BaselineActual actual) {
    BaselineDefinition def = findById(baselineId);
    BaselineCompareResult result = new BaselineCompareResult();
    result.setVisibleTextMatch(actual.getVisibleTexts().containsAll(def.getRequired().getVisibleTexts()));
    result.setUrlMatch(Pattern.matches(def.getRequired().getUrlPattern(), actual.getUrl()));
    result.setBusinessStateMatch(def.getRequired().getBusinessState().equals(actual.getBusinessState()));
    result.setNetworkMatch(actual.getNetworkEvents().stream()
        .allMatch(ne -> def.getRequired().getNetwork().stream()
            .anyMatch(n -> n.getMethod().equals(ne.getMethod()) 
                && Pattern.matches(n.getPathPattern(), ne.getUrl())
                && n.getStatus() == ne.getStatus())));
    return result;
}
```

**验收标准**:
- `mvn package` 通过
- 创建 baseline 后可通过 `/compare` 端点进行机器比较
- 审批操作写审计事件

---

### W1-9: assertion-service 独立 Spring Boot 服务骨架

**对应缺陷**: V51-DEF-004, 010, 037, 038, 039

**新建目录**: `services/assertion-service/`

```
services/assertion-service/
├── pom.xml
├── Dockerfile
└── src/main/
    ├── java/cn/localbank/assertion/
    │   ├── AssertionServiceApplication.java
    │   ├── AssertionController.java      # 4 个断言端点
    │   ├── AssertionService.java          # 聚合 caseId/runId 维度
    │   └── SecurityConfig.java
    └── resources/
        └── application.yml               # 端口 18092, datasource, fineract
```

**端点** (V5.1 §8):

| 端点 | 方法 | 说明 | 对应缺陷 |
|------|------|------|----------|
| `/internal/test-support/v1/assertions/{caseId}/{runId}` | GET | 按 caseId+runId 聚合所有断言 | DEF-037 |
| `/internal/test-support/v1/payments/{paymentId}` | GET | 按 paymentId 断言 (从 bank-channel-service 迁移) | DEF-038 |
| `/internal/test-support/v1/ledger/{correlationId}` | GET | 按 correlationId 断言 | DEF-038 |
| `/internal/test-support/v1/reconciliation/{correlationId}` | GET | 按 correlationId 断言 | DEF-038 |

**caseId/runId 聚合逻辑**:
```java
@GetMapping("/internal/test-support/v1/assertions/{caseId}/{runId}")
public Map<String, Object> aggregateAssertions(@PathVariable String caseId, @PathVariable String runId) {
    // 查询 regression_case 表获取 case_json
    // 从 case_json 中提取所有 paymentId/correlationId
    // 对每个 paymentId 调用 assertPayment
    // 对每个 correlationId 调用 assertLedger + assertReconciliation
    // 聚合返回 {caseId, runId, assertions: [...], overallStatus: PASS|FAIL}
}
```

**与 bank-channel-service 的关系**:
- bank-channel-service 的 `TestSupportController` 保留 (向后兼容)
- assertion-service 独立部署，通过共享数据库查询
- 两者共享 `bank_channel` 数据库

**验收标准**:
- `mvn package` 通过
- `/assertions/{caseId}/{runId}` 返回聚合断言结果
- 响应包含 `caseId` 和 `runId` 维度

---

### W1-10: Docker Compose 集成

**对应缺陷**: V51-DEF-006

**修改文件**: `compose.channel.yaml`

**新增服务**:

| 服务 | 镜像/构建 | 端口 | 网络 |
|------|-----------|------|------|
| `quality-case-portal` | nginx:1.27-alpine (digest-pinned) | 127.0.0.1:18084->80 | bank-channel-front |
| `fixture-service` | local build (Java 21) | 127.0.0.1:18090->8080 | bank-channel-net + mifos-core-net |
| `baseline-service` | local build (Java 21) | 127.0.0.1:18091->8080 | bank-channel-net |
| `assertion-service` | local build (Java 21) | 127.0.0.1:18092->8080 | bank-channel-net + mifos-core-net |

**修改 Gateway nginx.conf**:
```nginx
location /qcp/ {
    proxy_pass http://quality-case-portal:80/;
    proxy_set_header Host $host;
}
# /api/v1/cases, /api/v1/baselines -> bank-channel-service (第一批)
# 后续可路由到 baseline-service
```

**健康检查**: 每个新服务配置 `/actuator/health` 健康检查

**验收标准**:
- `docker compose up -d` 后 15 个容器全部 healthy (11 现有 + 4 新增)
- http://127.0.0.1:18084 可访问 quality-case-portal
- `final-regression.ps1` 7/7 PASS (不影响现有功能)

---

## 3. Track B：v4 并行修复

### W1-B1: 状态机转换矩阵 (P0-1)

**对应缺陷**: v4 fix-execution-plan P0-1

**修改文件**: `services/bank-channel-service/src/main/java/local/bank/channel/payments/statemachine/TransferStateMachine.java`

**当前转换矩阵** (有缺陷):
```java
ALLOWED.put(Status.CREATED, Set.of(Status.VALIDATING));
ALLOWED.put(Status.VALIDATING, Set.of(Status.PENDING_APPROVAL, Status.RISK_REVIEW, Status.FAILED));  // PENDING_APPROVAL 不在 v4 §10
ALLOWED.put(Status.PENDING_CORE_POSTING, Set.of(Status.PENDING_CLEARING, Status.FAILED));            // 缺 SETTLED
ALLOWED.put(Status.PENDING_CLEARING, Set.of(Status.SETTLED, Status.FAILED));                         // 缺 TIMED_OUT
ALLOWED.put(Status.SETTLED, Set.of(Status.REVERSAL_PENDING));                                        // 缺 RETURNED
```

**修复后** (匹配 v4 §10):
```java
ALLOWED.put(Status.CREATED, Set.of(Status.VALIDATING));
ALLOWED.put(Status.VALIDATING, Set.of(Status.RISK_REVIEW, Status.FAILED));                           // 删除 PENDING_APPROVAL
ALLOWED.put(Status.RISK_REVIEW, Set.of(Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING, Status.FAILED));
ALLOWED.put(Status.PENDING_APPROVAL, Set.of(Status.PENDING_CORE_POSTING, Status.FAILED));
ALLOWED.put(Status.PENDING_CORE_POSTING, Set.of(Status.PENDING_CLEARING, Status.SETTLED, Status.FAILED));  // 加 SETTLED
ALLOWED.put(Status.PENDING_CLEARING, Set.of(Status.SETTLED, Status.TIMED_OUT, Status.FAILED));           // 加 TIMED_OUT
ALLOWED.put(Status.SETTLED, Set.of(Status.RETURNED, Status.REVERSAL_PENDING));                           // 加 RETURNED
ALLOWED.put(Status.REVERSAL_PENDING, Set.of(Status.REVERSED));
```

**同步修改**:
- `TransferProcessor.java`: 确保 `VALIDATING -> RISK_REVIEW` 路径存在
- `TransferStateMachineTest.java`: 修正 `settledCannotTransitionToReturned` 为 `settledCanTransitionToReturned`；新增 `pendingCorePostingCanSettle`、`pendingClearingCanTimeout` 测试

**验收标准**: 转换矩阵精确匹配 v4 §10 的 17 个允许转换

---

### W1-B2: 清算超时传播 (P0-2)

**修改文件**: `MockClearingService.java`

**当前缺陷**: `propagateDeliverToTransfer()` 的 TIMED_OUT 分支只 log 不传播:
```java
case "TIMED_OUT":
    log.info("...not propagating to transfer");  // BUG
    break;
```

**修复后**:
```java
case "TIMED_OUT":
    stateMachine.transitionState(transferId, 
        Status.PENDING_CLEARING, Status.TIMED_OUT,
        "SYSTEM", "mock-clearing", "CLEARING_TIMEOUT");
    break;
```

**验收标准**: TIMEOUT_THEN_FAIL 场景后 transfer.status = TIMED_OUT；transfer_state_history 有记录

---

### W1-B3: inbox_event 合规迁移 (P0-3)

**新建文件**: `services/bank-channel-service/src/main/resources/db/changelog/v4-p0-inbox-event.yaml`

**补齐 5 列** (来自 v4 §8.4):
```yaml
- addColumn:
    tableName: inbox_event
    columns:
      - column: { name: event_type, type: varchar(160), constraints: { nullable: false, defaultValue: 'UNKNOWN' } }
      - column: { name: payload_hash, type: char(64), constraints: { nullable: false, defaultValue: '0000000000000000000000000000000000000000000000000000000000000000' } }
      - column: { name: processing_status, type: varchar(32), constraints: { nullable: false, defaultValue: 'PROCESSED' } }
      - column: { name: failure_detail, type: varchar(500) }
      - column: { name: created_at, type: timestamptz, defaultValueComputed: now(), constraints: { nullable: false } }
```

**同步修改**: `InboxService.java` 写入新列

**验收标准**: inbox_event 表有 7 列匹配 v4 §8.4

---

### W1-B4: transfer_order 约束迁移 (P0-4)

**新建文件**: `services/bank-channel-service/src/main/resources/db/changelog/v4-p0-transfer-order-constraints.yaml`

**内容**:
1. 新增 `customer_subject` 列，从 `subject` 回填
2. 新增 `uq_transfer_idempotency` UNIQUE(tenant_id, customer_subject, idempotency_key)
3. 新增 `uq_transfer_correlation` UNIQUE(tenant_id, correlation_id)
4. 新增 `idx_transfer_owner_time` INDEX(tenant_id, customer_subject, created_at DESC)
5. 新增 `idx_transfer_status` INDEX(tenant_id, status, created_at)
6. `request_hash` 设 NOT NULL (先回填)
7. `correlation_id` 设 NOT NULL (先回填)
8. `business_date` 设 NOT NULL (先回填)

**验收标准**: 约束和索引存在；现有数据不丢失

---

### W1-B5: transfer_receipt 类型修复 (P0-5)

**新建文件**: `services/bank-channel-service/src/main/resources/db/changelog/v4-p0-transfer-receipt-fix.yaml`

**内容**:
1. 验证所有 `transfer_receipt.transfer_id` 可转换为 UUID
2. 删除旧外键 (如有)
3. `ALTER COLUMN transfer_id TYPE uuid USING transfer_id::uuid`
4. 创建 FK `fk_transfer_receipt_transfer` -> `transfer_order(transfer_id)`

**当前缺陷**: v1 changelog YAML 重复键 bug 导致 `transfer_id` 为 `CHAR(64)` 而非 `UUID`，FK 无法创建。

**验收标准**: `transfer_receipt.transfer_id` 类型为 `uuid`；FK 存在；孤儿行数为 0

---

## 4. 执行顺序

```
Phase 1 (并行, 无依赖):
  W1-1  contract schemas          ──┐
  W1-2  DB tables Liquibase        ──┤
  W1-4  audit events               ──┤
  W1-B1 state machine matrix       ──┤
  W1-B2 clearing propagation       ──┤
  W1-B3 inbox_event migration      ──┤
  W1-B4 transfer_order constraints ──┤
  W1-B5 transfer_receipt fix      ──┘

Phase 2 (依赖 Phase 1):
  W1-3  Seed reads YAML (依赖 FineractAdapter 扩展)
  W1-5  Quality Case Portal (依赖 contract schemas)
  W1-6  Case/Baseline CRUD (依赖 DB tables + audit events)

Phase 3 (依赖 Phase 2):
  W1-7  fixture-service (依赖 W1-3 Seed 逻辑)
  W1-8  baseline-service (依赖 W1-6 Baseline CRUD)
  W1-9  assertion-service (依赖 W1-6 断言逻辑)

Phase 4 (依赖 Phase 3):
  W1-10 Docker Compose (依赖所有服务就绪)
```

## 5. 预估工时

| Task | 工时 |
|------|------|
| W1-1 contract schemas | 0.5d |
| W1-2 DB tables | 0.5d |
| W1-3 Seed reads YAML | 1.5d |
| W1-4 audit events | 0.5d |
| W1-5 Quality Case Portal | 1.0d |
| W1-6 Case/Baseline CRUD | 2.0d |
| W1-7 fixture-service | 1.0d |
| W1-8 baseline-service | 1.0d |
| W1-9 assertion-service | 1.0d |
| W1-10 Docker Compose | 0.5d |
| W1-B1 state machine | 0.5d |
| W1-B2 clearing propagation | 0.5d |
| W1-B3 inbox_event | 0.5d |
| W1-B4 transfer_order constraints | 0.5d |
| W1-B5 transfer_receipt | 0.5d |
| **总计** | **12.0d** |

## 6. 验收清单

### Track A 验收
- [ ] 4 个 JSON Schema 通过 ajv 编译
- [ ] regression_case + baseline_definition 表存在
- [ ] seed() 返回真实 Fineract ID
- [ ] seed/reset 写审计事件
- [ ] quality-case-portal 8 路由可访问
- [ ] Case/Baseline CRUD 端点全部返回正确响应
- [ ] fixture/baseline/assertion 3 个服务 mvn package 通过
- [ ] docker compose up 后 15 容器 healthy
- [ ] final-regression.ps1 7/7 PASS

### Track B 验收
- [ ] 转换矩阵 17 个允许转换匹配 v4 §10
- [ ] TIMED_OUT 回调传播到 transfer
- [ ] inbox_event 7 列匹配 v4 §8.4
- [ ] transfer_order 2 UNIQUE + 2 INDEX 存在
- [ ] transfer_receipt.transfer_id 类型为 uuid + FK 存在

## 7. 第一批覆盖范围

| 范围 | 覆盖数 |
|------|--------|
| V5.1 缺陷覆盖 | ~30/73 (41%) |
| v4 缺陷覆盖 | 5/39 (13%) |
| 新增 Docker 服务 | 4 |
| 新增 contract 文件 | 5 (4 schema + 1 OpenAPI) |
| 新增 Java 包 | 3 (case, fixture-service, baseline-service, assertion-service) |
| 新增前端项目 | 1 (quality-case-portal) |
| 新增 Liquibase changesets | ~10 |

## 8. 第二批预告

第一批完成后，第二批将包含:
- PoC 代码集成 (ADR-051-01~07)
- 视频上传/存储/元数据/PII 遮蔽 (V51-DEF-043~048)
- 30 条人工成功案例 (V51-DEF-057)
- auth-state:create 完整实现 + Storage State (V51-DEF-032~035)
- catalog:lint 脚本 (V51-DEF-031)
- aria-label 补充 (V51-DEF-028)
- PageContainer SUCCESS 子态 (V51-DEF-029)
- Namespace 隔离 (V51-DEF-033)
- 多 FixtureProfile (V51-DEF-042)
- @midscene/web 依赖 (V51-DEF-074)

---

_方案编写: opencode/glm-5-2_
_日期: 2026-07-13_
_仓库: https://github.com/JunyeOvO/banksystem.git_
_分支: agent/publish-banksystem_
