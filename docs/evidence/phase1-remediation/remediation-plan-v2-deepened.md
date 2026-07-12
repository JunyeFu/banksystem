# P1 阻断修复深化计划(含 Q1-Q4 决策)

> **决策已确认**:
> - **P1-2 路径**:B 全量重命名为 v4 §10.3 状态命名
> - **P1-3 策略**:A 平滑切换(`preConditions onFail=MARK_RAN` + 切前预演)
> - **Q1 状态历史重复行**:D2 迁移后**清理**重复行,仅保留首末行
> - **Q2 前端展示**:状态名中文化(枚举 i18n,如 `APPROVED → 已批准`)
> - **Q3 AsyncAPI 事件版本**:由实施者决定 → 见 §K 决策说明
> - **Q4 回滚脚本**:用户不检查,故不强制提供(仍会写 backup snapshot 保障 DB)

---

## 1. 状态映射(代码现 → v4 §10.3)

| 代码当前 | v4 §10.3 | 语义 |
|---------|----------|------|
| CREATED | CREATED | 原名保留 |
| (无) | **RISK_PENDING** 新增 | 风险评估中 |
| VALIDATING / RISK_REVIEW | RISK_PENDING | 折叠,VALIDATING 现仅在 RISK_PENDING 前瞬间存在,合并 |
| PENDING_APPROVAL | REVIEW_REQUIRED | 待人工复核 |
| (无) | **APPROVED** 新增 | 风控通过 |
| (无) | **RESERVED** 新增 | 份额预留 |
| PENDING_CORE_POSTING | (并入 APPROVED→RESERVED) | 折叠 |
| PENDING_CLEARING | **SUBMITTED** | 已提交清算/核心 |
| SETTLED | SETTLED | 原名保留 |
| FAILED | FAILED | 原名保留 |
| TIMED_OUT | TIMED_OUT | 原名保留 |
| RETURNED | RETURNED | 原名保留 |
| REVERSAL_PENDING | REVERSAL_PENDING | 原名保留 |
| REVERSED | REVERSED | 原名保留 |

**态数**:代码 12 → v4 §10.3 12(数量同,分布不同 — 新增 3 态:RISK_PENDING/APPROVED/RESERVED/SUBMITTED,删除 3 态:VALIDATING/RISK_REVIEW/PENDING_APPROVAL/PENDING_CORE_POSTING/PENDING_CLEARING — 实际净增 1 态 →12 →13 态?重新核对:

- 代码现状:`CREATED, VALIDATING, RISK_REVIEW, PENDING_APPROVAL, PENDING_CORE_POSTING, PENDING_CLEARING, SETTLED, FAILED, TIMED_OUT, RETURNED, REVERSAL_PENDING, REVERSED` = **12**
- v4 §10.3:`CREATED, RISK_PENDING, REVIEW_REQUIRED, APPROVED, RESERVED, SUBMITTED, SETTLED, FAILED, TIMED_OUT, RETURNED, REVERSAL_PENDING, REVERSED` = **12** ✓

### 转换路径(基于 §13.1 + 代码现状)

```
CREATED → RISK_PENDING
RISK_PENDING → APPROVED | REVIEW_REQUIRED | FAILED
REVIEW_REQUIRED → APPROVED | FAILED
APPROVED → RESERVED | FAILED
RESERVED → SUBMITTED | FAILED
SUBMITTED → SETTLED | TIMED_OUT | FAILED
TIMED_OUT → SETTLED | FAILED | RETURNED
SETTLED → RETURNED | REVERSAL_PENDING
RETURNED → REVERSAL_PENDING
REVERSAL_PENDING → REVERSED
```

**本行转账路径(5 跳)**:`CREATED → RISK_PENDING → APPROVED → RESERVED → SUBMITTED → SETTLED`
**跨行路径(7 跳)**:`CREATED → RISK_PENDING → APPROVED → RESERVED → SUBMITTED → [TIMED_OUT 回收 / RETURNED] → SETTLED / REVERSED`

---

## 2. P1-2 状态机强制类 + 全量重命名(4.5 天)

### 2.1 新建 `TransferStateMachine` 类

位置:`services/bank-channel-service/src/main/java/local/bank/channel/statemachine/TransferStateMachine.java`

接口:
```java
public class TransferStateMachine {
  public enum Status { CREATED, RISK_PENDING, REVIEW_REQUIRED, APPROVED, RESERVED, SUBMITTED,
                       SETTLED, FAILED, TIMED_OUT, RETURNED, REVERSAL_PENDING, REVERSED }
  private static final Map<Status, Set<Status>> ALLOWED = ...;  // §13.1 矩阵
  public void checkTransition(Status from, Status to);          // 非法 → IllegalStateTransitionException (409)
  public void transitionState(JdbcTemplate jdbc, UUID transferId, Status from, Status to,
                              String actorType, String actorId, String reasonCode, Map metadata);
  // 内部:UPDATE transfer SET status=?, version=version+1, updated_at=now() WHERE transfer_id=? AND status=? AND version=?;
  //       影响行数 0 → ConcurrentModificationException
  //       INSERT INTO transfer_state_history(...)
  //       INSERT INTO transfer_outbox(...) (status.changed 事件)
}
```

### 2.2 三处生产代码重写

- `TransferProcessor`:本行 `CREATED → RISK_PENDING → APPROVED → RESERVED → SUBMITTED → SETTLED`(原 3 跳变 5 跳),Fineract accountTransfer 在 `RESERVED → SUBMITTED` 或 `SUBMITTED → SETTLED` 阶段触发(保留 `SUBMITTED → SETTLED` 调 Fineract)
- `MockClearingService.propagateSubmitToTransfer`:`RISK_PENDING → APPROVED → RESERVED → SUBMITTED`(3 跳合并)
- `MockClearingService.propagateDeliverToTransfer`:`SUBMITTED → SETTLED/TIMED_OUT/RETURNED`
- `TransferReversalController`:`SETTLED → REVERSAL_PENDING → REVERSED`(名不变,加 checkTransition 守护)
- `EodController.pending` 状态列表:`('CREATED','RISK_PENDING','REVIEW_REQUIRED','APPROVED','RESERVED','SUBMITTED')`
- `ReconciliationService` 状态字面量:不变(仍 SETTLED/REVERSED)
- `MonitorController` / 其他 status 引用处:扫描全代码 grep `status.*=.*['"]` 替换

### 2.3 前端中文化(i18n 映射)

`packages/bank-domain-types/` 加 `transfer-status-i18n.ts`:
```ts
export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  CREATED: '已创建',
  RISK_PENDING: '风控审核中',
  REVIEW_REQUIRED: '待人工复核',
  APPROVED: '已批准',
  RESERVED: '已预留',
  SUBMITTED: '已提交',
  SETTLED: '已结算',
  FAILED: '失败',
  TIMED_OUT: '已超时',
  RETURNED: '已退回',
  REVERSAL_PENDING: '冲正待审批',
  REVERSED: '已冲正',
};
```

`apps/customer-portal/src/pages/TransferList.tsx`、`TransferResult.tsx`、`apps/operations-console/src/pages/PaymentDetail.tsx`、`PaymentMonitoring.tsx`、`Approvals.tsx`、`RiskCases.tsx` 等所有 status 显示位 引用枚举。

### 2.4 OpenAPI / AsyncAPI 更新

- `contracts/openapi/operations-api.yaml:113` enum 替换为 12 态 v4 名
- `contracts/openapi/customer-api.yaml` 同步
- `contracts/asyncapi/bank-events.yaml` TransferStatusChanged payload schema `status` enum 同步

### 2.5 测试重写

- `TransferStateMachineTest`:12 态 × §13.1 矩阵,≥15 个 case
- `ReconciliationLogicTest`:状态名引用更新
- 新增 `TransferStateMachineDataMigrationTest`:模拟旧数据 changeset 后验证新状态名

### 2.6 SQL 数据迁移(嵌入 P1-3 D2 changeset)

```sql
-- 1) 状态名映射
UPDATE transfer SET status = CASE status
  WHEN 'VALIDATING' THEN 'RISK_PENDING'
  WHEN 'RISK_REVIEW' THEN 'RISK_PENDING'
  WHEN 'PENDING_APPROVAL' THEN 'REVIEW_REQUIRED'
  WHEN 'PENDING_CORE_POSTING' THEN 'RESERVED'
  WHEN 'PENDING_CLEARING' THEN 'SUBMITTED'
  ELSE status END
WHERE status IN ('VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING');

-- 2) transfer_state_history 同步 from_status / to_status
UPDATE transfer_state_history SET from_status = (CASE from_status ...)
UPDATE transfer_state_history SET to_status = (CASE to_status ...)

-- 3) Q1 决策:清理重复行,仅保留首末(per transfer_id)
DELETE FROM transfer_state_history
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY transfer_id ORDER BY id) AS rn,
           COUNT(*) OVER (PARTITION BY transfer_id) AS cnt
    FROM transfer_state_history
  ) t WHERE rn = 1 OR rn = cnt
);

-- 4) transfer_outbox.payload JSONB 中 "status":"VALIDATING" 等替换
UPDATE transfer_outbox SET payload = jsonb_set(payload, '{status}',
  to_jsonb(CASE payload->>'status'
    WHEN 'VALIDATING' THEN 'RISK_PENDING'
    WHEN 'RISK_REVIEW' THEN 'RISK_PENDING'
    WHEN 'PENDING_APPROVAL' THEN 'REVIEW_REQUIRED'
    WHEN 'PENDING_CORE_POSTING' THEN 'RESERVED'
    WHEN 'PENDING_CLEARING' THEN 'SUBMITTED'
    ELSE payload->>'status' END::text))
WHERE payload->>'status' IN ('VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING');

-- 5) eod_run / reconciliation_run 等 details:类似处理(若存了状态名 JSON)
```

---

## 3. P1-3 Liquibase 平滑切换(2 天,含 P1-2 数据迁移)

### 3.1 changeset 分组

**D1: 全 20 表 createTable**(0.8 天)
- `db/changelog/v2-full-schema.yaml` 包含 20 张表完整 createTable,每张 `preConditions: onFail: MARK_RAN - not: [tableExists: {tableName: ...}]`
- 同步含表级 CHECK 约束:`CHECK (status IN ('CREATED','RISK_PENDING',...))`(v4 §10.3 12 态)
- 含 `idx_ledger_correlation` / `idx_ledger_transfer` 等索引

**D2: 状态名数据迁移**(0.3 天,等 P1-2 代码完成)
- 5 段 SQL(见 2.6)

**D3: 金额精度 NUMERIC(19,2)**(0.1 天,P1-4 并入)
- `ALTER TABLE transfer ALTER COLUMN amount TYPE NUMERIC(19,2) USING round(amount::numeric, 2)`
- `ALTER TABLE loan_application ALTER COLUMN requested_amount TYPE NUMERIC(19,2) USING round(requested_amount::numeric, 2)`

**D4: 可变表补 updated_at + version**(0.2 天,P1-5 并入)
- 14 表 `addColumn updated_at TIMESTAMPTZ DEFAULT now()`
- 8 表 `addColumn version BIGINT DEFAULT 0`
- 3 表 `modifyDataType version INTEGER → BIGINT`
- 1 表 `addColumn loan_approval.created_at`(审计漏列)

**D5: spring.sql.init 切换 + 预演 + 验证**(0.6 天)

### 3.2 切换步骤

1. 在已部署 `mifos-channel-bank-channel-postgres-1` 上做快照:
   `docker exec mifos-channel-bank-channel-postgres-1 pg_dump -U bank_channel bank_channel > /tmp/pre-p1-3-dump.sql`
2. 用 docker maven 镜像跑 `liquibase:updateSQL` 预览 SQL 输出
3. 人工对照 5 段 SQL 在已部署库上 dry-run 检查
4. 改 `application.yml`:`spring.sql.init.mode: never`
5. 移走 `schema.sql`(重命名为 `schema.sql.legacy` 或移动到 `docs/reference/`)
6. `docker compose -f compose.channel.yaml build bank-channel-service && docker compose up -d --force-recreate bank-channel-service`
7. 验证启动日志:每个 Liquibase changeset `EXECUTED` 或 `MARK_RAN`,无 FAILED
8. 验证 `\d transfer`:`status VARCHAR CHECK IN ('CREATED','RISK_PENDING',...)`, `amount NUMERIC(19,2)`, `version BIGINT`, `updated_at TIMESTAMPTZ`

---

## 4. 其他 P1 项核查修订

| 编号 | 工时修订 | 关键修订 |
|------|----------|----------|
| P1-1 | 1d(不变) | 增加 `Route path` ↔ `pageId` ↔ `data-testid` 三元组抓取;`ops.*` 改 `operations.*` 13 处 |
| P1-4 | 0d(并入 P1-3 D3) | 不独立编码 |
| P1-5 | 0d(并入 P1-3 D4) | 不独立编码,新增 `loan_approval.created_at` |
| P1-6 | 1.5d(+0.5) | 前置扩 `FineractAdapter.createClient/createSavingsAccount`;P0-3 已修 reset 清 ledger_entry,移除该子步骤 |
| P1-7 | 0.2d(原 0.5) | P0-2 已实现 `FineractAdapter.advanceBusinessDate` |
| P1-8 | 0.5d(不变) | 复用 `FineractAdapter.savingsTransactions`(已就绪) |
| P1-9 | 0d(并入 P1-1) | 5min |
| P1-10 | 0.5d(不变) | 删除"pom 加 release"冗余;用 docker maven 镜像执行 |
| P1-11 | 0.2d(原 0.5) | 仅改 `depends_on: condition: service_healthy`;healthcheck 现状已正确 |

### 总工时

| | 原估 | 复评 |
|---|------|------|
| P1-1 | 1d | 1d |
| P1-2 | 1d | **4.5d** |
| P1-3 | 1d | **2d**(含 D3/D4 并入) |
| P1-4 | 0.5d | **0d** |
| P1-5 | 0.5d | **0d** |
| P1-6 | 1d | 1.5d |
| P1-7 | 0.5d | **0.2d** |
| P1-8 | 0.5d | 0.5d |
| P1-9 | 5min | **0d** |
| P1-10 | 0.5d | 0.5d |
| P1-11 | 0.5d | **0.2d** |
| **合计** | **6.5d** | **10.4d** |

---

## 5. 执行顺序(W2 严依赖链)

```
① P1-10 Maven Wrapper            [0.5d, 无依赖, 第一波]
② P1-1+P1-9 Page Catalog         [1d, 无依赖, 第一波并列]
   ↓
③ P1-2 TransferStateMachine 类   [0.5d, 不依赖前置, 第二波]
④ P1-2 三处重写                  [1.5d, 必须在③之后]
⑤ P1-2 OpenAPI/AsyncAPI/前端     [1d, 必须在④之后]
   ↓
⑥ P1-3 D1 20 表 Liquibase        [0.8d, 独立可前移]
⑦ P1-2/P1-3 D2 数据迁移          [0.3d, 必须在④⑤⑥之后]
⑧ P1-3 D3/D4 金额+version        [0.3d, 必须在⑥之后]
⑨ P1-3 切切换+重启验证           [0.6d, 必须在⑥⑦⑧之后]
   ↓
⑩ P1-2 测试重写                  [1d, 必须在⑨之后]
```

W3:
```
⑪ P1-6 Fixture YAML + Adapter 扩 [1.5d, 独立]
⑫ P1-7 business-date:advance    [0.2d, Adapter 已就绪]
⑬ P1-8 assertPayment 核心验证   [0.5d, 独立]
⑭ P1-11 网关 depends_on         [0.2d, 最后]
```

---

## K. Q3 决策说明(AsyncAPI 事件版本)

决策者:实施者(opencode-go/glm-5.2),基于本地沙盒性质 + P2-3 outbox 表名/列名演进一并处理:

1. **本次 P1-2 改动**:把 `transfer.status.changed` payload `status` enum 直接替换为 v4 §10.3 12 态(破坏性变更,无版本号保留)
2. **未来 P2-3 时**:`outbox_event` 表加 `event_version INTEGER DEFAULT 1` 列;AsyncAPI schema 加 `event_version` field。破坏性变更 → bump 到 2
3. **理由**:沙盒无生产下游消费者,可承受 breaking;保留版本字段占位即可。如果 v4 强要 backward-compatible,本计划要求重新评审。

---

## L. 回滚保障(用户不需检查,自动创设)

虽然用户选 Q4 不检查回滚脚本,但 P1-3 切换前自动做 DB 快照保留在 `docs/evidence/phase1-remediation/snapshots/pre-p1-3-dump.sql`(由实施者执行 `pg_dump`),保留 48 小时(void 前自动删除)。
代码层 git revert 永远可用。

---

## M. v4 验收门对照

| § | 要求 | 修订后 | 验收点 |
|---|------|--------|--------|
| §1.4 #4 | 12 态全可达 | ✓ | P0-3 + P1-2 ⑤后 |
| §10.3 | DB CHECK 约束 | ✓ | P1-3 D1 |
| §13.1 | 转换矩阵严格 | ✓ | P1-2 ③类 + 测试 |
| §13.1 | 非法转换 409 | ✓ | P1-2 ③ IllegalStateTransitionException |
| §23.3 | YAML 驱动 Fixture | ✓ | P1-6 |
| §23.5 | assertPayment 核心验证 | ✓ | P1-8 |
| §27 #5 | 写操作幂等+状态机 | ✓ | P1-2 ③ |
| §29.1 | schema-lint | ✓ | P1-3 切换后 |

---

_本深化计划于 W2 实施前锁定,任何中途发现的新前置事件需补到 §2 状态机修订底注。_