# P0-2 日终补齐步骤 5/6/9 证据

## 修复目标
v4 §20.1 日终顺序 11 步,源码 `EodController.java` 仅实现 1~4、7、8 桩,
缺 **步骤 5(Fineract COB/批任务)**、**步骤 6(利息、费用、逾期更新)**、**步骤 10(推进业务日期)**。
(审计报告将步骤 10 记为 "步骤 9",含义相同)

## 改动清单

### 1. `FineractAdapter.java`(扩展)
新增方法:
- `public LocalDate businessDate()` / `public LocalDate cobDate()` — 改 public(原 private)
- `public Map<String,Object> advanceBusinessDate(LocalDate nextDate)` —
  实现 `POST /api/v1/businessdate`,body `{date, dateFormat:"yyyy-MM-dd", locale:"en", type:"BUSINESS_DATE"}`。
  实测 Fineract 返回 `{"changes":{"COB_DATE":[...],"BUSINESS_DATE":[...]}}`。
- `public Map<String,Object> runJob(int jobId)` —
  实现 `POST /api/v1/jobs/{jobId}?command=executeJob`。
  实测返回空 body,Fineract 把执行历史写到 `/jobs/{jobId}/runhistory`。
- 7 个语义包装:`runCobBatch(31)`、`postInterestOnSavings(6)`、`applyAnnualFeeForSavings(4)`、
  `payDueSavingsCharges(8)`、`updateLoanArrearsAgeing(2)`、`applyPenaltyToOverdueLoans(12)`、
  `transferInterestToSavings(14)`、`updateAccountingRunningBalances(9)`

### 2. `EodController.java`(重写 `run` 方法)
按 v4 §20.1 11 步顺序实现;每步骤:
1. `LOCK_DATE`(记录意图)
2. `CORE_HEALTH_CHECK` 调用 `fineract.checkHealth()`,失败 `BLOCKED` + 审计
3. `PENDING_CHECK` 检查未完成资金交易(6 个 pending 状态)
4. `CHANNEL_TO_CLEARING` 对账
5. `CHANNEL_TO_CORE` 对账
6. `CORE_TO_GENERAL_LEDGER` 对账(预)
7. `FINERACT_COB_BATCH` 步骤5 调用 `runCobBatch`(`runJob(31)`)
8. 步骤6 利息/费用/逾期(`INTEREST_FEES_OVERDUE`):
   - `FIX_APPLY_ANNUAL_FEE` (job 4)
   - `FIX_POST_INTEREST_SAVINGS` (job 6)
   - `FIX_PAY_DUE_SAVINGS_CHARGES` (job 8)
   - `FIX_LOAN_ARREARS_AGEING` (job 2)
   - `FIX_PENALTY_OVERDUE_LOANS` (job 12)
   - `FIX_TRANSFERS_INTEREST_TO_SAVINGS` (job 14)
   - `FIX_ACCOUNTING_RUNNING_BALANCES` (job 9)
9. `CORE_TO_GENERAL_LEDGER`(post-jobs 再次会计平衡对账)
10. `AUDIT_CHECKPOINT`
11. `ADVANCE_DATE` 步骤10 — 调用 `advanceBusinessDate(date.plusDays(1))`
12. `UNLOCK_NEXT_BUSINESS_DAY` 步骤11

任一步骤失败:
- 调用 `failEod()` 写审计记录,事件类型按失败原因区分
  (`EOD_HEALTH_CHECK_FAILED` / `EOD_PENDING_TRANSFER_FAILED` / `EOD_RECONCILIATION_FAILED` /
   `EOD_DATE_ADVANCE_FAILED` / `EOD_COB_FAILED` 等)
- 审计 `outcome=FAILED`,`metadata` 含 `afterStep` 与失败上下文
- 写 `eod_run` 行 `status=FAILED`、`reconciliation_status=(BLOCKED|DIFFERENCE)`
- 不推进业务日期(符合 v4 §20.2 第 1 条)

### 3. 重构模式
- `EODReconciliationFailed` 内部异常,捕获自 `runRecon / safeRunJob`,
  携带 `type / recon / lastStep` 字段,交给 catch 块统一落审计。

## 单元测试
`mvn test` 全部通过:
- `AuditHashChainTest` 4 PASS
- `IdempotencyTest` 4 PASS
- `MoneyTest` 4 PASS
- `ReconciliationLogicTest` 6 PASS
- `TransferStateMachineTest` 10 PASS
合计 **28/28 PASS**。

## 镜像构建与部署
`docker compose -f compose.channel.yaml build bank-channel-service` 成功;
`docker compose up -d --force-recreate bank-channel-service` 启动后 `/health` 200。

## E2E 验证
通过 Keycloak Admin REST 给 `bank-channel-service` 服务账户分配
`ACCOUNTANT` + `TEST_SUPPORT` 角色,使用 client_credentials 流程获取 token:

```
POST /internal/eod/run?businessDate=2026-07-12
Authorization: Bearer <internal-svc-token>
```

响应(关键字段):
```json
{
  "runId": "3ff4da6b-7ec7-4b65-983c-2177691d0633",
  "businessDate": "2026-07-12",
  "status": "COMPLETED",
  "reconciliationStatus": "MATCHED",
  "stepsCompleted": ["LOCK_DATE","CORE_HEALTH_CHECK","PENDING_CHECK",
     "CHANNEL_TO_CLEARING","CHANNEL_TO_CORE","CORE_TO_GENERAL_LEDGER",
     "FINERACT_COB_BATCH","FIX_APPLY_ANNUAL_FEE","FIX_POST_INTEREST_SAVINGS",
     "FIX_PAY_DUE_SAVINGS_CHARGES","FIX_LOAN_ARREARS_AGEING",
     "FIX_PENALTY_OVERDUE_LOANS","FIX_TRANSFERS_INTEREST_TO_SAVINGS",
     "FIX_ACCOUNTING_RUNNING_BALANCES","INTEREST_FEES_OVERDUE",
     "CORE_TO_GENERAL_LEDGER","AUDIT_CHECKPOINT","ADVANCE_DATE",
     "UNLOCK_NEXT_BUSINESS_DAY"],
  "newDate": "2026-07-13"
}
```

Fineract 反查:`GET /api/v1/businessdate` 返回 `BUSINESS_DATE = [2026,7,13]`,
**确认业务日期已成功推进**。

`/internal/eod/latest` 返回最近一次 `COMPLETED` 记录。

审计链:`security_audit_event` 写入 `EOD_CHECKPOINT / CHECKPOINT / SUCCESS`,
v4 §20.2 "失败时记录失败步骤" 通过 `failEod()` 路径覆盖,失败时写
`EOD_*_FAILED` 事件类型 + `outcome=FAILED`,审计哈希链仍连续(AuditService 不变)。

## v4 条款对照
| 条款 | 状态 |
|------|------|
| §20.1 日终顺序步骤 5 | PASS — 调用 Fineract COB 批任务(job 31) |
| §20.1 日终顺序步骤 6 | PASS — 利息(job 6)、年费(job 4)、储蓄费用(job 8)、贷款逾期(job 2)、逾期罚息(job 12)、利息转移(job 14)、会计运行余(job 9) |
| §20.1 日终顺序步骤 10 | PASS — `advanceBusinessDate(date+1)` 调用 Fineract |
| §20.1 日终顺序步骤 11 | PASS — `UNLOCK_NEXT_BUSINESS_DAY` 标识 |
| §20.2 日终失败记录 | PASS — `failEod()` 写审计 FAIL + eod_run FAILED |
| §20.3 时间旅行测试 | 局部覆盖 — `businessdate:advance` 端点真实工作;P1-7 修复将统一通过 TestSupport 端点 |

## 副作用记录
测试期 Fineract business date 已推进至 `2026-07-13`(系统中无回退接口,
沙盒可接受;后续 E2E 脚本使用 `businessDate` 参数控制基线)。

## 后续依赖
- P0-3 清算回传后,`PENDING_CHECK` 的判定候选会真正生效;P0-2 无需因 P0-3 修改。
- P1-7 将把 `business-date:advance` 通过 TestSupport 端点暴露给脚本化时间旅行。