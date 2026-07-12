# P2 阻断修复深化方案 v1.1（基于运行库实况修订）

> 时间:2026-07-12
> 实施者:opencode-go/glm-5.2(ClaudeCodeWorker WSL)
> 状态:部分代码与 P2-2 迁移已落地；已冻结，待按本方案前向修复
> 配套证据目录:`docs/evidence/phase1-remediation/p2/`
> 配套脚本目录:`scripts/`(P2-3 验证脚本)

> **关键定位**:P2 是 v4 §1.4 退出条件**不强制**的"建议项"。但本轮用户决定走完整 v4 合规路径,即每项 P2 都对齐 v4 §10.2 / §13.1 / ADR-002 原文,不留 ADR 豁免。这意味着 P2 实际比 P1 的部分项影响更广(尤其 P2-2 重做 idempotency 主键、P2-3 重命名 outbox 表)。

> **v1.1 实况覆盖声明（2026-07-12）**：本文件原 v1.0 的“实施待启动”和“Docker 当前不可达”均已失效。只读审计确认：运行数据库已记录 `v3-p2-2-idempotency-add-v4-columns`、`v3-p2-2-idempotency-data-migration`、`v3-p2-2-idempotency-set-not-null`；`transfer_outbox` 仍存在且 `outbox_event` 尚不存在；渠道服务当前未运行。已 RUN 的 v3-P2-2 changeset **不得修改、删除或重放**，后续所有修复必须追加前向 Liquibase changeset。

---

## 0. 跨项关键约束(实施前必读)

| 约束 | 影响 |
|------|------|
| P1 基线必须完整保留 | `db.changelog-master.yaml` 必须按 `v1 → v2-p1-transfer-status → v3-p2-*` 顺序 include；不得遗漏 v2 |
| P2-2 的前三个 changeset 已 RUN | 禁止改写其文件；以新的 `v3-p2-2-*` 前向 changeset 补齐列、数据、约束与外键 |
| Liquibase 变更必须可重复部署 | 新 changeset 使用精确 `preConditions`；不要以 `MARK_RAN` 掩盖必需的数据迁移失败 |
| Docker 与 PostgreSQL 可用，但渠道服务当前停用 | 先修复源码与变更集，再在隔离窗口启动服务；不得把当前半成品直接部署 |
| P2-2/P2-3 影响运行中容器 | 切换前备份 `idempotency_record`、`transfer`、`transfer_outbox`，停止 `bank-channel-service`，迁移和验证完成后再启动 |
| P0/P1 状态契约已为 v4 12 态 | 所有 P2 SQL、监控、脚本和测试只能使用 `RISK_PENDING/REVIEW_REQUIRED/APPROVED/RESERVED/SUBMITTED` 等现行状态名 |

---

## 1. 执行批次总览(已确认)

```
Wave 0（串行，阻断解除，必须先完成）:
  ⊙ 恢复 master 中 v2-p1-transfer-status include
  ⊙ 对已 RUN 的 P2-2 执行前向兼容设计，不重写历史 changeset
  ⊙ 统一 outbox 最终物理列名（建议保留 legacy event_id 并在 API 映射为 id，或一次性 rename；二选一）
  ⊙ 将所有旧状态名、旧表名引用列入迁移清单

Wave 1（低风险、可在服务停用时完成）:
  ⊙ P2-4 对账 correlationId 语义与断言契约
  ⊙ P2-5 EOD advisory lock + PostgreSQL 并发集成测试
  ⊙ P2-6 EOD_FAILED 后端响应模型、OpenAPI、前端模型同步

Wave 2（串行，数据库切换窗口）:
  ⊙ P2-2 前向补齐 idempotency v4：应用双读/双写兼容 → 数据与 FK 迁移 → 删除旧列另行评审
  ⊙ P2-3 outbox 迁移：停服务 → rename/补列/回填/索引 → 全部 SQL、脚本、AsyncAPI 同步 → 启动服务

Wave 3（仅 Wave 1/2 通过后）:
  ⊙ P2-1 按 ADR-002 的已确认 10 包机械拆分；不与数据库迁移同一提交

每个 Wave 完成后必须运行 Java 21 Maven 测试、前端生产构建、Liquibase 启动验证；Wave 2 额外运行有凭据 E2E 与回滚演练。
```

---

## 2. 证据目录与产物清单

### 2.1 证据文档(每项一项)
- `docs/evidence/phase1-remediation/p2/P2-2-idempotency-v4.md`
- `docs/evidence/phase1-remediation/p2/P2-3-outbox-event-rename.md`
- `docs/evidence/phase1-remediation/p2/P2-4-assert-reconciliation-correlation-id.md`
- `docs/evidence/phase1-remediation/p2/P2-5-eod-advisory-lock.md`
- `docs/evidence/phase1-remediation/p2/P2-6-eod-failed-alert.md`
- `docs/evidence/phase1-remediation/p2/P2-1-package-split-adr002.md`
- `docs/evidence/phase1-remediation/p2/P2-summary-report.md`(收尾汇中)

### 2.2 数据库 changeset
- `services/bank-channel-service/src/main/resources/db/changelog/v3-p2-2-idempotency-v4.yaml`
- `services/bank-channel-service/src/main/resources/db/changelog/v3-p2-3-outbox-event-rename.yaml`
- `db.changelog-master.yaml` 追加 include v3 两项

### 2.3 Java 代码
- `services/bank-channel-service/src/main/java/local/bank/channel/TransferController.java`(P2-2)
- `services/bank-channel-service/src/main/java/local/bank/channel/OutboxPublisher.java`(P2-3)
- `services/bank-channel-service/src/main/java/local/bank/channel/statemachine/TransferStateMachine.java`(P2-3)
- `services/bank-channel-service/src/main/java/local/bank/channel/TestSupportController.java`(P2-2/P2-3/P2-4)
- `services/bank-channel-service/src/main/java/local/bank/channel/MonitoringController.java`(P2-3/P2-6)
- `services/bank-channel-service/src/main/java/local/bank/channel/EodController.java`(P2-5)
- `services/bank-channel-service/src/main/java/local/bank/channel/ReconciliationService.java`(P2-4)
- `services/bank-channel-service/src/test/java/local/bank/channel/IdempotencyTest.java`(P2-2 重写)
- `services/bank-channel-service/src/test/java/local/bank/channel/ReconciliationLogicTest.java`(P2-4 重写)
- 新建 `services/bank-channel-service/src/test/java/local/bank/channel/EodConcurrencyTest.java`(P2-5)
- 新建 `services/bank-channel-service/src/test/java/local/bank/channel/OutboxPublisherV4Test.java`(P2-3)

### 2.4 黑色盒 子包(仅 P2-1)
- 32 个 `.java` 文件 `git mv` 到 11 个子包(详见 §8)
- 所有 import 路径批量 sed 替换

### 2.5 契约 / AsyncAPI / OpenAPI / 前端
- `contracts/asyncapi/bank-events.yaml`:version `0.2.0 → 0.3.0`,加 `eventVersion` 与 `headers` 字段
- `contracts/openapi/operations-api.yaml`:`/internal/monitoring/alerts` 响应加 503 状态 + `X-Alert` 头
- `apps/operations-console/src/pages/SystemHealth.tsx`:加 `EOD_FAILED` 卡片

### 2.6 验证脚本
- `scripts/p2-3-verify-outbox.sh`:启动一笔转账 → 等 OutboxPublisher 调度周期 → 校验 `outbox_event.status='PUBLISHED'` 且 `published_at NOT NULL`

### 2.7 DB 快照(health check,可选)
- `docs/evidence/phase1-remediation/p2/snapshots/pre-p2-2-dump.sql`
- `docs/evidence/phase1-remediation/p2/snapshots/pre-p2-3-dump.sql`

---

## 3. Wave 1 详细 — P2-4/P2-5/P2-6(并行 0.9d)

### 3.1 P2-4 assertReconciliation 按 correlationId 过滤(0.5d)

**v4 出处**:§17.4 运营 API、§23 TestSupport Assertion API、§27 审查清单 #4。

**现状**:
- `TestSupportController.assertReconciliation(correlationId)` 路径接收 `correlationId` 入参
- SQL:`SELECT ... FROM reconciliation_run ORDER BY created_at DESC LIMIT 5` — **完全忽略入参**
- `ReconciliationService.run(type)` 写入 `reconciliation_run.details` 字段为**纯文本**,不含 `correlationId`

**改动**:
1. **`ReconciliationService.run(type)` → `run(type, correlationId optional)`**
   - 从 MDC `correlationId` 取,若入参为空也可作为兜底
   - `details` 字段从纯文本改为 JSON:`{"correlationId":"CORR-xxx","message":"Channel-to-core...","differenceCount":N}`
   - 写库 SQL 改为 `?::jsonb` 参数

2. **`TestSupportController.assertReconciliation` SQL 重写**
```sql
SELECT reconciliation_type, status, difference_count, details
FROM reconciliation_run
WHERE details::jsonb ->> 'correlationId' = ?
ORDER BY created_at DESC LIMIT 5
```
   - 若结果为空:fallback 全量查询,响应显式标注 `"correlationIdFilter":"fallback"` 与 `"matchedCount":0`
   - 若匹配:`"correlationIdFilter":"matched"` 与 `"matchedCount":N`

3. **`ReconciliationLogicTest` 重写**
   - 状态名(已在 P1-2 改为新 v4 §10.3 12 态)保持
   - 新断言:`details` JSON 字段含 `correlationId`

**验收**:
- E2E transfer 之后调 `POST /api/v1/transfers` 取得 correlationId → `GET /assertions/reconciliation/<corrId>`
- 响应 `runs[0].details` JSON 含相同 `correlationId`,`matchedCount >= 1`
- 若无匹配:fallback 路径不抛错,返回 `correlationIdFilter: "fallback"`

**风险**:低。ReconciliationService.run 在 EOD 与一些手动调用处都用,改 details JSON 后 ReconciliationLogicTest 与 EodController.runRecon 需兼容新 schema。

---

### 3.2 P2-5 EOD 并发锁(0.2d)

**v4 出处**:§20.2 日终失败 重跑必须幂等、§27 审查清单 #5。

**现状**:`EodController.run` 含 `@Transactional`,但无 advisory lock;两个并发请求可同时推进业务日期,产生灾难性后果。

**改动**:
```java
@PostMapping("/internal/eod/run")
public Map<String, Object> run(@RequestParam(required = false) LocalDate businessDate) {
  // 事务首行:获取事务级 advisory lock
  // hashtext('eod-run') 返回一个 int32 hash,pg_advisory_xact_lock 阻塞同 hash 请求
  jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext('eod-run'))", Object.class);
  // ... 后续逻辑保持不变 ...
}
```

**新增测试 `EodConcurrencyTest`**:
- 模拟 2 线程并发调 `run()`
- 断言:总耗时 > 单次耗时(并发被锁阻塞)
- 用 Testcontainers PG 或本机临时 PG;H2 测试环境不支持 `pg_advisory_xact_lock`,通过 `@ActiveProfiles("test")` 跳过该测试

**验收**:
- 启动 2 个 EOD `curl` 并发 → 第二个等待第一个完成才返回,不产生双推进 date
- `eod_run` 表同一 businessDate 不会出现 2 条同时推进成功的记录

**风险**:极低。advisory lock 是 Postgres 内置,若有非 PG 数据库,该 SQL 会报错 → 但本项目只支持 PostgreSQL。

---

### 3.3 P2-6 MonitoringController EOD_FAILED 告警(0.2d)

**v4 出处**:§21.3 告警 失败能被发现、§1.4 退出条件 #10 安全审计通过。

**现状**:`MonitoringController.alerts()` 检查 5 类告警(`CORE_OUTAGE/TRANSFER_PENDING/OUTBOX_BACKLOG/RECONCILIATION_DIFFERENCE/DLQ_NON_EMPTY`),但**没有 EOD 失败检查**。

**改动**:
```java
@GetMapping("/internal/monitoring/alerts")
public ResponseEntity<Map<String, Object>> alerts() {
  // ... 现有 5 类告警代码保持 …

  // 新增:EOD 24 小时内是否有失败
  Integer eodFailed = jdbc.queryForObject(
      "SELECT count(*) FROM eod_run "
          + "WHERE status = 'FAILED' AND created_at > now() - interval '24 hours'",
      Integer.class);
  boolean eodAlert = eodFailed != null && eodFailed > 0;

  Map<String, Object> body = new LinkedHashMap<>();
  body.put("alerts", result);
  body.put("count", result.size());

  if (eodAlert) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("X-Alert", "EOD_FAILED");
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .headers(headers)
        .body(body);
  }
  return ResponseEntity.ok(body);
}
```

**契约同步**:
- `contracts/openapi/operations-api.yaml` `/internal/monitoring/alerts`:
  - 响应 status 200 与 503
  - 503 头 `X-Alert: EOD_FAILED` 显式 schema
- `apps/operations-console/src/pages/SystemHealth.tsx`:
  - 新增 `EOD_FAILED` 告警卡片(红色,severity `P0`)
  - 利用 `health-row-alert-id` 已存在的 data-testid,无须新加 testid

**验收**:
- 触发一次 EOD 失败(强制 `fineract.checkHealth` 返 false,如停 fineract 容器)
- `curl /internal/monitoring/alerts` → 503 + `X-Alert: EOD_FAILED`
- SystemHealth UI 显示 EOD 失败告警卡片

---

## 4. Wave 2 详细 — P2-2 / P2-3(并行,需停容器)

### 4.1 P2-2 idempotency_record v4 完整升级(1d,高风险)

**v4 出处**:§10.2 idempotency_record 完整 DDL、§9.6 幂等规范、ADR-004 资金写操作确定性控制。

**目标 schema**(`v4-fineract-plan §10.2`):
```sql
CREATE TABLE idempotency_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_key           VARCHAR(512) NOT NULL UNIQUE,
    request_hash        CHAR(64) NOT NULL,
    status              VARCHAR(32) NOT NULL,
    http_status         INTEGER,
    response_headers    JSONB,
    response_body       JSONB,
    resource_id         UUID,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
```

**changeset 设计**(`v3-p2-2-idempotency-v4.yaml`):
```yaml
databaseChangeLog:
  - changeSet:
      id: v3-p2-2-idempotency-add-v4-columns
      author: P2-2
      preConditions:
        - onFail: MARK_RAN
        - columnExists: { tableName: idempotency_record, columnName: idempotency_key }
      changes:
        - addColumn:
            tableName: idempotency_record
            columns:
              - column: { name: id, type: uuid, defaultValueComputed: gen_random_uuid(), constraints: { nullable: false } }
              - column: { name: scope_key, type: varchar(512) }
              - column: { name: status, type: varchar(32), defaultValue: 'OK' }
              - column: { name: http_status, type: integer }
              - column: { name: response_headers, type: jsonb }
              - column: { name: response_body, type: jsonb }
              - column: { name: resource_id, type: uuid }
              - column: { name: expires_at, type: timestamptz, defaultValueComputed: "now() + interval '24 hours'" }

  - changeSet:
      id: v3-p2-2-idempotency-migrate-data
      author: P2-2
      changes:
        - sql: |
            UPDATE idempotency_record
            SET scope_key = idempotency_key,
                status = 'OK',
                http_status = status_code,
                response_body = to_jsonb(response_body::text)
            WHERE scope_key IS NULL;

  - changeSet:
      id: v3-p2-2-idempotency-promote-id-pk
      author: P2-2
      changes:
        - dropPrimaryKey: { tableName: idempotency_record, constraintName: idempotency_record_pkey }
        - addPrimaryKey: { tableName: idempotency_record, constraintName: idempotency_record_pkey, columnNames: id }
        - addUniqueConstraint:
            tableName: idempotency_record
            columnNames: scope_key
            constraintName: uq_idempotency_scope_key

  - changeSet:
      id: v3-p2-2-transfer-fk-redirect
      author: P2-2
      changes:
        - sql: |
            ALTER TABLE transfer DROP CONSTRAINT IF EXISTS fk_transfer_idempotency;
            ALTER TABLE transfer ADD CONSTRAINT fk_transfer_idempotency
              FOREIGN KEY (idempotency_key) REFERENCES idempotency_record(scope_key);

  - changeSet:
      id: v3-p2-2-idempotency-drop-legacy-cols
      author: P2-2
      changes:
        - dropColumn: { tableName: idempotency_record, columnName: status_code }
        - dropColumn: { tableName: idempotency_record, columnName: response_body }
```

**Java 改动**:

`TransferController.create` 改写:
```java
// 旧:
// jdbc.update("INSERT INTO idempotency_record(idempotency_key, request_hash, response_body, status_code) VALUES (?, ?, ?, ?)",
//     key, hash, body, 202);
// 新:
jdbc.update(
    "INSERT INTO idempotency_record(scope_key, request_hash, status, http_status, response_body, expires_at) "
        + "VALUES (?, ?, 'OK', 202, ?::jsonb, now() + interval '24 hours')",
    key, hash, body);
// 旧:
// var existing = jdbc.query("SELECT request_hash, response_body, status_code FROM idempotency_record WHERE idempotency_key = ?", ...);
// 新:
var existing = jdbc.query(
    "SELECT request_hash, response_body, http_status FROM idempotency_record WHERE scope_key = ?",
    (rs, n) -> Map.<String,Object>of(
        "hash", rs.getString(1),
        "body", rs.getString(2),
        "status", rs.getInt(3)), key);
```

`IdempotencyTest`(4 测试)全重写:
- 断言新列 `scope_key`(替代 `idempotency_key` 主键)
- 断言 `response_body` 为 JSONB 解析后取 `transferId`
- 新增 case:`scope_key` 已存在 + 同 request body → 409
- 新增 case:`scope_key` 已存在 + 异 request hash → 409 (body mismatch)
- 新增 case:`expires_at` 已过期 → (沙盒不主动过期,但保留字段)

`TestSupportController.reset`:`DELETE FROM idempotency_record` 不需改表名。

`TestSupportController.assertPayment`(原 line 172):
```java
"SELECT count(*) FROM idempotency_record WHERE scope_key IN "
  + "(SELECT idempotency_key FROM transfer WHERE transfer_id = ?)"
```
`idempotency_key` 仍是 `transfer` 列名(FK 指向 `scope_key`),保留。

**风险与缓解**:
- 风险:idempotency 中间件每次转账调用,改错重账 → 必须先 pg_dump 备份 idempotency_record 全表
- 缓解:`docker exec mifos-channel-bank-channel-postgres-1 pg_dump -U bank_channel -d bank_channel -t idempotency_record -t transfer > /tmp/pre-p2-2-idempotency.sql`
- 测试 ≥6 例覆盖:相同(同 body 重复)+ 冲突(异 body)+ 缺失(404)+ 过期(暂跳过)

---

### 4.2 P2-3 transfer_outbox → outbox_event 重命名(1.5d,中风险)

**v4 出处**:§10.2 outbox_event 完整 DDL、§14 事件契约 AsyncAPI、§27 审查清单 #3 outbox v4 列与 AsyncAPI 一致。

**目标 schema**:
```sql
CREATE TABLE outbox_event (
    id                  UUID PRIMARY KEY,
    aggregate_type      VARCHAR(64) NOT NULL,
    aggregate_id        UUID NOT NULL,
    event_type          VARCHAR(160) NOT NULL,
    event_version       INTEGER NOT NULL,
    payload             JSONB NOT NULL,
    headers             JSONB NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_dispatch ON outbox_event (status, next_attempt_at, created_at);
```

**changeset 设计**(`v3-p2-3-outbox-event-rename.yaml`):
```yaml
databaseChangeLog:
  - changeSet:
      id: v3-p2-3-outbox-rename-table
      author: P2-3
      preConditions:
        - onFail: MARK_RAN
        - tableExists: { tableName: transfer_outbox }
      changes:
        - renameTable:
            oldTableName: transfer_outbox
            newTableName: outbox_event

  - changeSet:
      id: v3-p2-3-outbox-add-v4-columns
      author: P2-3
      changes:
        - addColumn:
            tableName: outbox_event
            columns:
              - column: { name: aggregate_type, type: varchar(64), defaultValue: 'Transfer', constraints: { nullable: false } }
              - column: { name: aggregate_id, type: uuid }
              - column: { name: event_version, type: integer, defaultValueNumeric: 1, constraints: { nullable: false } }
              - column: { name: headers, type: jsonb, defaultValue: '{}'::jsonb, constraints: { nullable: false } }
              - column: { name: status, type: varchar(32), defaultValue: 'PENDING', constraints: { nullable: false } }

  - changeSet:
      id: v3-p2-3-outbox-migrate-data
      author: P2-3
      changes:
        - sql: |
            UPDATE outbox_event
            SET aggregate_id = transfer_id,
                status = CASE WHEN published_at IS NULL THEN 'PENDING' ELSE 'PUBLISHED' END;

  - changeSet:
      id: v3-p2-3-outbox-payload-to-jsonb
      author: P2-3
      changes:
        # Postgres 14+ 支持 text → jsonb 自动转换但需 USING 子句
        - sql: |
            ALTER TABLE outbox_event
              ALTER COLUMN payload TYPE jsonb USING to_jsonb(payload::text);

  - changeSet:
      id: v3-p2-3-outbox-add-dispatch-index
      author: P2-3
      changes:
        - createIndex:
            tableName: outbox_event
            indexName: idx_outbox_dispatch
            columns:
              - column: { name: status }
              - column: { name: next_attempt_at }
              - column: { name: created_at }

  - changeSet:
      id: v3-p2-3-outbox-rebuild-fk
      author: P2-3
      changes:
        - sql: |
            ALTER TABLE outbox_event DROP CONSTRAINT IF EXISTS fk_40569_transfer;
            ALTER TABLE outbox_event
              ADD CONSTRAINT fk_outbox_aggregate_transfer
                FOREIGN KEY (aggregate_id) REFERENCES transfer(transfer_id);
```

**Java 改动(7 文件)**:

`OutboxPublisher`(全文需重写 SELECT/UPDATE SQL):
```java
// 旧:
// "SELECT event_id, transfer_id, event_type, payload, attempt_count FROM transfer_outbox "
//     + "WHERE published_at IS NULL AND next_attempt_at <= now() ORDER BY created_at LIMIT 100"
// 新:
"SELECT id, aggregate_type, aggregate_id, event_type, event_version, payload, headers, status, attempt_count "
    + "FROM outbox_event WHERE status = 'PENDING' AND next_attempt_at <= now() "
    + "ORDER BY created_at LIMIT 100"

// UPDATE changes:
"UPDATE outbox_event SET status='PUBLISHED', published_at=now(), updated_at=now() WHERE id = ?"
"UPDATE outbox_event SET attempt_count=?, next_attempt_at=now()+interval '1 second'*?, updated_at=now() WHERE id=?"
```

`TransferStateMachine.transitionState`:
```java
// 旧:
// jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)", ...);
// 新:
jdbc.update(
    "INSERT INTO outbox_event(id, aggregate_type, aggregate_id, event_type, event_version, payload, headers, status, next_attempt_at) "
        + "VALUES (?, 'Transfer', ?, 'transfer.status.changed', 1, ?::jsonb, '{}'::jsonb, 'PENDING', now())",
    UUID.randomUUID(), transferId, payload);
```

`TransferController.create`(line 88)同样将 INSERT 改为写 `outbox_event`。

`TestSupportController.reset`:`DELETE FROM transfer_outbox` → `DELETE FROM outbox_event`

`TestSupportController.assertPayment`(line 162):`SELECT event_id, event_type, published_at FROM transfer_outbox WHERE transfer_id = ?` → `SELECT id, event_type, published_at, status FROM outbox_event WHERE aggregate_id = ?`

`MonitoringController.alerts`:`SELECT count(*) FROM transfer_outbox WHERE published_at IS NULL` → `SELECT count(*) FROM outbox_event WHERE status = 'PENDING'`

**契约同步**:
- `contracts/asyncapi/bank-events.yaml`:
  - `version: 0.2.0 → 0.3.0`
  - 在 `TransferStatusChanged` schema 中加 `eventVersion: { const: 1 }` field
  - 加 `headers: { type: object, additionalProperties: true, description: 'CloudEvent headers' }` field
- `contracts/openapi/operations-api.yaml`(`assertPayment` / `assertReconciliation`)schema 中 outbox 返回 的字段名同步

**验证脚本 `scripts/p2-3-verify-outbox.sh`**:
```bash
#!/usr/bin/env bash
# P2-3 outbox 重命名后验证调度路径
set -euo pipefail

GW="http://127.0.0.1:18443"
SVC_TOKEN="$1"  # 传入服务账户 bearer

# 1. 起一笔转账
resp=$(curl -s -X POST -H "Authorization: Bearer $SVC_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: p2-3-verify-$(date +%s)-$$" \
    -d '{"sourceAccountId":"1","destinationAccountId":"2","amount":"0.01","currency":"CNY","reference":"p2-3 verify"}' \
    "$GW/api/operations/v1/transfers")
tid=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['transferId'])")
echo "transfer created: $tid"

# 2. 等待 OutboxPublisher 调度周期(默认 1~2 秒)
echo "waiting OutboxPublisher poll cycle..."
sleep 3

# 3. 查 outbox_event status
published=$(docker exec mifos-channel-bank-channel-postgres-1 \
    psql -U bank_channel -d bank_channel -t -A -c \
    "SELECT count(*) FROM outbox_event WHERE aggregate_id='$tid' AND status='PUBLISHED' AND published_at IS NOT NULL")
echo "published events for this transfer: $published"

if [ "$published" -ge 1 ]; then
    echo "P2-3 outbox verify: PASS"
    exit 0
else
    echo "P2-3 outbox verify: FAIL"
    exit 1
fi
```

**风险与缓解**:
- P2-3 changeset 期间 OutboxPublisher 仍可能在跑 → 必须先停容器
- AsyncAPI breaking 变更 → bump 0.3.0,Q3 决策已确认接受
- Postgres < 14 不支持 `USING to_jsonb(payload::text)`,但本项目 PostgreSQL 18.3,无问题

---

## 5. Wave 3 详细 — P2-1 模块化分包(1.5d)

**v4 出处**:ADR-002 10 模块化单体清单。

**子包划分**(ADR-002 列 10 个,我加 `eod`、`infra` 凑 11 个;如严格守 10 则合并 `eod → payments` 与 `infra → 根包`):

| 子包 | 类 |
|------|-----|
| `identity` | CustomerController 中 customer_identity 相关 |
| `accounts` | AccountLifecycleController,CashierController |
| `beneficiaries` | BeneficiaryController |
| `payments` | TransferController,TransferProcessor,TransferProcessorController,TransferReceiptController,TransferReversalController,OutboxPublisher,InboxService,MockClearingController,MockClearingService,**statemachine.TransferStateMachine** |
| `risk` | RiskController,RiskService |
| `notifications` | NotificationController,StatementController |
| `documents` | LoanDocumentController |
| `reconciliation` | ReconciliationController,ReconciliationService |
| `audit` | AuditService,MonitoringController |
| `customerprofile` | LoanApplicationController,LoanApprovalController,LoanCoreController,LoanScoringController |
| `eod` | EodController |
| `infra` | BankChannelApplication,SecurityConfig,ProblemHandler,TracingFilter,HealthController,FineractAdapter,TestSupportController |

**默认建议**:严格守 ADR-002 原文 10 个,把 `eod` 并入 `payments`(因 EOD 是日终处理延伸)、`infra` 留在根 `local.bank.channel`( infra 类本来就是基础设施,放根包像 Commons)。实施时按如下 10 包:

| 子包 | 类 |
|------|-----|
| `identity` | CustomerController 中 customeridentity 相关 |
| `accounts` | AccountLifecycleController,CashierController |
| `beneficiaries` | BeneficiaryController |
| `payments` | TransferController,TransferProcessor,TransferProcessorController,TransferReceiptController,TransferReversalController,OutboxPublisher,InboxService,MockClearingController,MockClearingService,statemachine.TransferStateMachine,**EodController**(并入) |
| `risk` | RiskController,RiskService |
| `notifications` | NotificationController,StatementController |
| `documents` | LoanDocumentController |
| `reconciliation` | ReconciliationController,ReconciliationService |
| `audit` | AuditService,MonitoringController |
| `customerprofile` | LoanApplicationController,LoanApprovalController,LoanCoreController,LoanScoringController |
| 根包 `local.bank.channel` | BankChannelApplication,SecurityConfig,ProblemHandler,TracingFilter,HealthController,FineractAdapter,TestSupportController |

### 5.1 实施步骤(可重复脚本化)

```bash
# Step 1: 创建子包目录
cd /mnt/d/Agent/banksystem/services/bank-channel-service/src/main/java/local/bank/channel
mkdir -p identity accounts beneficiaries payments/risk notifications documents reconciliation audit customerprofile payments/statemachine

# Step 2: 移动 .java 文件(git mv 保留历史)
# payments 类
git mv TransferController.java payments/
git mv TransferProcessor.java payments/
git mv TransferProcessorController.java payments/
git mv TransferReceiptController.java payments/
git mv TransferReversalController.java payments/
git mv OutboxPublisher.java payments/
git mv InboxService.java payments/
git mv MockClearingController.java payments/
git mv MockClearingService.java payments/
git mv EodController.java payments/
git mv statemachine/TransferStateMachine.java payments/statemachine/
rmdir statemachine

# 其他子包
git mv CustomerController.java identity/  # 注:CustomerController 含多职责,后续按方法 split 或整体放 identity
git mv AccountLifecycleController.java accounts/
git mv CashierController.java accounts/
git mv BeneficiaryController.java beneficiaries/
git mv RiskController.java risk/
git mv RiskService.java risk/
git mv NotificationController.java notifications/
git mv StatementController.java notifications/
git mv LoanDocumentController.java documents/
git mv ReconciliationController.java reconciliation/
git mv ReconciliationService.java reconciliation/
git mv AuditService.java audit/
git mv MonitoringController.java audit/
git mv LoanApplicationController.java customerprofile/
git mv LoanApprovalController.java customerprofile/
git mv LoanCoreController.java customerprofile/
git mv LoanScoringController.java customerprofile/

# infra 类保持在根包:BankChannelApplication,SecurityConfig,ProblemHandler,TracingFilter,HealthController,FineractAdapter,TestSupportController

# Step 3: 修改每个文件的 package 声明
# 用 find + sed 批处理
find . -name "*.java" -exec sed -i \
    -e 's|^package local\.bank\.channel\.statemachine;|package local.bank.channel.payments.statemodel;|' \
    -e 's|^package local\.bank\.channel;|package local.bank.channel.<subpackage>;|' \
    {} \;
# 但 sed 难以分辨每个文件应放哪个子包;更稳妥用 python 脚本读路径匹配

# Step 4: 修改所有 import 语句
# 全文 sed:
find services/bank-channel-service/src -name "*.java" -exec sed -i \
    -e 's|import local\.bank\.channel\.TransferStateMachine;|import local.bank.channel.payments.statemachine.TransferStateMachine;|' \
    -e 's|import local\.bank\.channel\.TransferStateMachine\.\([A-Z][a-zA-Z]*\);|import local.bank.channel.payments.statemachine.TransferStateMachine.\1;|' \
    -e 's|import local\.bank\.channel\.\(TransferController\|TransferProcessor\|TransferProcessorController\|TransferReceiptController\|TransferReversalController\|OutboxPublisher\|InboxService\|MockClearingController\|MockClearingService\|EodController\);|import local.bank.channel.payments.\1;|' \
    -e 's|import local\.bank\.channel\.\(AccountLifecycleController\|CashierController\);|import local.bank.channel.accounts.\1;|' \
    -e 's|import local\.bank\.channel\.BeneficiaryController;|import local.bank.channel.beneficiaries.BeneficiaryController;|' \
    -e 's|import local\.bank\.channel\.\(RiskController\|RiskService\);|import local.bank.channel.risk.\1;|' \
    -e 's|import local\.bank\.channel\.\(NotificationController\|StatementController\);|import local.bank.channel.notifications.\1;|' \
    -e 's|import local\.bank\.channel\.LoanDocumentController;|import local.bank.channel.documents.LoanDocumentController;|' \
    -e 's|import local\.bank\.channel\.\(ReconciliationController\|ReconciliationService\);|import local.bank.channel.reconciliation.\1;|' \
    -e 's|import local\.bank\.channel\.\(AuditService\|MonitoringController\);|import local.bank.channel.audit.\1;|' \
    -e 's|import local\.bank\.channel\.\(LoanApplicationController\|LoanApprovalController\|LoanCoreController\|LoanScoringController\);|import local.bank.channel.customerprofile.\1;|' \
    {} \;
# CustomerController 可能引用混乱,先单独审查再决定是否 split

# Step 5: 同步 package-info.java(可选,每个子包写一句 ADR-002 引用)
```

### 5.2 `@SpringBootApplication` 调整

`BankChannelApplication.java`(保持在根包):
```java
@SpringBootApplication(scanBasePackages = "local.bank.channel")
public class BankChannelApplication { ... }
```
显式 `scanBasePackages` 兜底确保子包被扫描。

### 5.3 测试代码同步移动
`src/test/java/local/bank/channel/` 下:
- `TransferStateMachineTest.java` → `payments/statemachine/`
- `IdempotencyTest.java` → `payments/`(因其测 TransferController)
- `ReconciliationLogicTest.java` → `reconciliation/`
- `MoneyTest.java` → 根包(通用,无对应模块)
- `AuditHashChainTest.java` → `audit/`

### 5.4 工时与风险

- 工时:1.5d(占大头是 mvn test 重跑 + 个别 import 修补)
- 风险:纯机械重构,任何遗漏 import 立刻编译 fail → 风险场景低且可见性高
- 备份:`git status` + `git stash` 在 Wave 3 启动前留 snapshot

### 5.5 验收
- `mvn -DskipTests compile` 编译通过
- `mvn test` 28+ 单元测试全 PASS
- `docker compose build bank-channel-service` 镜像构建成功
- 一个 smoke E2E:启容器 → `POST /api/operations/v1/transfers` → 201,无启动依赖注入错误

---

## 6. 工时与依赖汇总

| Wave | 项 | 工时 | 风险 | 验收 |
|------|----|------|------|------|
| Wave 1 并行 | P2-4 | 0.5d | 低 | assertReconciliation 响应含 correlationIdFilter |
| Wave 1 并行 | P2-5 | 0.2d | 低 | 并发 EOD 不会双推进 date |
| Wave 1 并行 | P2-6 | 0.2d | 低 | alerts 在 EOD 失败时返 503 + X-Alert |
| Wave 2 并行 | P2-2 | 1.0d | 高(idempotency) | 测 6 例 PASS,pg_dump 备份 |
| Wave 2 并行 | P2-3 | 1.5d | 中(表名) | OutboxPublisher 调度正常,p2-3-verify-outbox.sh PASS |
| Wave 3 串行 | P2-1 | 1.5d | 低(机械) | mvn compile + test PASS,docker smoke E2E PASS |
| **合计** | | **5.4d** | | |

+ 运行时 E2E 全回归 0.5~1d(docker 恢复后)

---

## 7. v4 验收门对照(P2 完成后)

| § | 要求 | P2 后状态 |
|---|------|-----------|
| §1.4 退出条件 | 不强依赖 P2 | 不变(P0+P1 已满足) |
| §27 审查清单 | idempotency / outbox 与 v4 §10.2 一致 | PASS(P2-2 + P2-3 后) |
| ADR-002 模块化 | 10 模块 | PASS(P2-1 后,10 子包) |
| §21.3 告警 | EOD 失败可被发现 | PASS(P2-6 后) |
| §29.1 schema-lint | outbox v4 列与 AsyncAPI 一致 | PASS(P2-3 后) |
| §20.2 日终重跑幂等 | 并发锁确保持 | PASS(P2-5 后) |

---

## 8. 跨项横切:风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| P2-2/P2-3 changeset 部署中 OutboxPublisher 仍读旧表 → SQL 报错 | Outbox 推迟,changeset 失败 | 切换前 `docker compose stop bank-channel-service`,跑 changeset,再 `start` |
| P2-3 表名重命名后旧 AsyncAPI schema 下游消费断 | (沙盒无生产下游) | 接受 breaking,bump 0.3.0(Q3 决策) |
| P2-1 拆包后 Spring 不识别 `@Component` | 启动失败 | `@SpringBootApplication(scanBasePackages = "local.bank.channel")` 兜底扫描根包 |
| P2-5 advisory_lock H2 测试环境不支持 | 单测失败 | 用 `@ActiveProfiles("test")` 跳过,或 Testcontainers PG |
| P2-4 ReconciliationService.details 改 JSON 影响其他读 | ReconciliationLogicTest 改 | 同步改测试断言 |
| P2-2 idempotency 主键改造影响所有转账幂等 | 全局重复转账风险 | 强制 pg_dump 备份 + IdempotencyTest 新增 6 例 |

---

## 9. 决策记录(W4 启动前由用户确认)

| # | 决策项 | 决策 | 影响 |
|---|--------|------|------|
| Q1 | P2-1 分包 | A. 完整拆包到 v4 §10.2 10 模块 | 工时 1.5d,纯机械 |
| Q2 | P2-3 outbox | A. 重命名 + 全 v4 列 + payload JSONB | 工时 1.5d,中风险 |
| Q3 | P2-2 idempotency | A. 完整对齐 v4(改主键 + scope_key + expires_at) | 工时 1d,高风险 |
| Q4 | P2 执行顺序 | A. Wave1 低风险并行 → Wave2 高风险并行 → Wave3 拆包 | 总工时 5.4d |
| Q5 | 证据目录 | A. `docs/evidence/phase1-remediation/p2/` 新建 | 与 P0/P1 同结构 |
| Q6 | P2-3 验证脚本 | A. 加 `scripts/p2-3-verify-outbox.sh` | 自动化验证 outbox 调度 |
| Q7 | AsyncAPI 事件版本 | 由实施者决定 → bump 0.2.0 → 0.3.0 | 沙盒无生产下游,可承受 |
| Q8 | 回滚脚本检查 | 用户不检查 → 仍自动存 pg_dump 快照 | 保障 DB 回滚 |

---

## 10. v1.1 实施启动门禁

启动条件不是“开始 Wave 1”，而是先完成 **Wave 0 设计复核**：

1. 恢复 `v2-p1-transfer-status.yaml` 的 master include，并用新库启动测试证明 v1→v2→v3 顺序完整。
2. 记录当前数据库 changelog、`idempotency_record`、`transfer`、`transfer_outbox` 的可恢复备份；不读取或提交敏感配置。
3. 为 P2-2 新建前向 changeset：补齐缺失 v4 字段、回填可空数据、建立 `scope_key` 唯一约束和 FK；旧列删除必须拆到“应用已不再读取旧列”的后续 changeset。
4. 为 P2-3 在实施前确定单一物理列映射。所有生产 SQL、TestSupport、恢复脚本、E2E 清理、监控与契约必须同批更新。
5. 修正 P2-6 告警 DTO：后端与前端均以同一 `code/severity/status` 模型处理，503 时固定返回 `X-Alert: EOD_FAILED`。

Wave 2 启动条件：

- Wave 0 与 Wave 1 已完成 Java 21 Maven 测试、前端 build 和代码审查；
- 用户确认维护窗口，停止 `bank-channel-service`，并完成数据库备份；
- 有不暴露凭据的方式取得 E2E 所需服务授权，或明确记录该验证受限。

Wave 3 启动条件：

- Wave 2 已通过迁移后启动、outbox 发布/重试、幂等回归和恢复演练；
- 模块拆分单独提交，避免与数据迁移交织。

---

_本方案文档锁定,如实施中发现新前置需补到 §10 实施启动确认底注。_
