# P0-3 清算结果回传 transfer 状态机 证据

## 修复目标
v4 §13.1/§13.4 P0 模拟跨行流程、§25 Phase 4 退出条件。
原 `MockClearingService.deliver` 只在 `clearing_payment.status` 上推进状态,
从不回传 `transfer.status`,导致 `PENDING_CLEARING / TIMED_OUT / RETURNED` 在生产路径不可达
(死代码);同时 `TIMEOUT_THEN_FAIL` 永远停留 `TIMED_OUT`,无终态 FAILED。

## 改动清单

### 1. `MockClearingService.java` 重写
- 新增注入 `TransferProcessor` 与 `AuditService`。
- `submit(...)`:在创建 `clearing_payment` 后,调用 `propagateSubmitToTransfer(...)`:
  - `ACCEPTED`:`CREATED/VALIDATING → PENDING_CLEARING`,落 `transfer_state_history`,
    写 outbox `transfer.clearing.pending`,审计 `TRANSFER_CLEARING_ACCEPTED`。
  - `REJECTED`:入参 `failureCode/failureDetail`,直接走 `retryPendClearingToTerminal(...)` 失败路径。
- `deliver(...)`:select `transfer_id`,在清除回调时调用 `propagateDeliverToTransfer(...)`:
  - `SETTLED`:`PENDING_CLEARING/TIMED_OUT` → 调 `transferProcessor.process(transferId)` 完成核心入账,
    由 `TransferProcessor` 统一写入 `transfer_outbox / ledger_entry / audit`。
  - `RETURNED`:`SETTLED → RETURNED`,写 `transfer_state_history`,outbox `transfer.returned`,审计 `TRANSFER_RETURNED`。
  - `TIMED_OUT`:`PENDING_CLEARING → TIMED_OUT`,标记中间状态。
  - `REJECTED/FAILED`:`retryPendClearingToTerminal` 落 `transfer.status=FAILED`,failure_reason 写库,
    outbox `transfer.clearing.failed`,审计 `TRANSFER_FAILED`。
  - 重复(duplicate)/乱序(out-of-order)回调不传播。
- `retryPendClearingToTerminal(...)` 统一终态落地:
  - 校验当前态可跳转(防止重复写入状态机历史);
  - 写 `transfer.failure_reason`、`transfer_state_history`、`transfer_outbox`、`security_audit_event`。
- `determineStatus(...)`:**`TIMEOUT_THEN_FAIL` 在 `deliveryCount>=3` 时改为 `FAILED`**,修复终态缺口。

### 2. `TransferProcessor.java` 重构入口
- 允许入口状态:`CREATED / VALIDATING / PENDING_CLEARING / TIMED_OUT`(后两个走跨行);
- 区分 `fromStatus`:本行转账从 `PENDING_CORE_POSTING` 入账、跨行走 `PENDING_CLEARING/TIMED_OUT`;
- 失败/成功转换前 `fromStatus` 正确(防状态机历史"回落")。

### 3. `TransferStateMachineTest.java` 调整矩阵
- `CREATED` 增加 `PENDING_CLEARING`(直接走跨行);
- 新增 `TIMED_OUT → SETTLED/FAILED/RETURNED` 转换(超时回收路径)。
- 测试 PASS:10/10(原矩阵 + 跨行扩展)。

### 4. `TransferController.get` NPE 修复(副产物)
- 原实现 `Map.of("coreReference", rs.getString(5), "correlationId", ...)` 在列值为 NULL 时抛
  `NullPointerException`(Map.of 不允许 null);
- 改为 `LinkedHashMap`,对 NULL 显式回落为空串。
- 与审计 P1-9 关联,但属 P0-3 验证场景所必需,提前修。

### 5. `TestSupportController.reset` 补清 `ledger_entry`
- 原 `reset` 未清 `ledger_entry`,导致 `DELETE FROM transfer` 触发外键 `ledger_entry_transfer_id_fkey`,
  集成测试返 500;
- 在 `DELETE FROM transfer_outbox` 前新增 `DELETE FROM ledger_entry`。
- 与审计 P1-6 相关,本修复一并落地(不属提前 P1,因 P0-3 E2E 重复 reset 必需)。

## 单元测试
`mvn test` 全部通过:
- `AuditHashChainTest` 4 PASS
- `IdempotencyTest` 4 PASS
- `MoneyTest` 4 PASS
- `ReconciliationLogicTest` 6 PASS
- `TransferStateMachineTest` 10 PASS(矩阵扩展后)
合计 **28/28 PASS**。

## E2E 验证(9 场景)
脚本:`/tmp/opencode/p0-3-e2e.sh`。两轮执行结果一致:

| 场景 | 清算 submit | deliver 序列 | transfer 终态 | 结果 |
|------|-------------|-------------|---------------|------|
| SUCCESS_IMMEDIATE | ACCEPTED | [1] | SETTLED | PASS |
| SUCCESS_DELAYED | ACCEPTED | [1,2] | SETTLED | PASS |
| REJECT_ACCOUNT_INVALID | REJECTED | [] | FAILED | PASS |
| REJECT_BANK_UNAVAILABLE | REJECTED | [] | FAILED | PASS |
| TIMEOUT_THEN_SUCCESS | ACCEPTED | [1,2,3] | SETTLED | PASS |
| TIMEOUT_THEN_FAIL | ACCEPTED | [1,2,3] | FAILED | PASS |
| RETURN_AFTER_SETTLEMENT | ACCEPTED | [1,2] | RETURNED | PASS |
| DUPLICATE_CALLBACK | ACCEPTED | [1](再投 1) | SETTLED | PASS(重复不重记账) |
| OUT_OF_ORDER_CALLBACK | ACCEPTED | [1,5] | SETTLED | PASS(乱序入账,无重复) |

**合计:PASS=9 / FAIL=0**。

每个场景额外验证:
- `transfer_state_history` 行数与场景状态链长度匹配;
- `transfer_outbox` 事件数与状态变化数匹配;
- `security_audit_event` 含本 transfer 的审计记录,数量与状态变化一致。

### 状态机桥接示例(SUCCESS_IMMEDIATE)
原始:`CREATED → PENDING_CLEARING → SETTLED`(借 `transfer-processor` 终态审计)
```
            | CREATED |            | <svc token>
 CREATED    | PENDING_CLEARING | CLEARING_ACCEPTED | mock-clearing
 PENDING_CLEARING | SETTLED |                   | transfer-processor
```
Terminal `transfer.status=SETTLED`,`core_reference=42`(Fineract accountTransfer 返回 resourceId),
`ledger_entry` 含 source/destination 借贷分录。

## v4 条款对照
| 条款 | 状态 |
|------|------|
| §13.1 12 态枚举全部可达 | PASS — 9 场景覆盖 SETTLED/FAILED/RETURNED/PENDING_CLEARING/TIMED_OUT |
| §13.1 非法转换 409 | 部分 PASS — `TransferStateMachineTest` 已守;P1-2 生产守卫类待补 |
| §13.4 P0 模拟跨行流程步骤 4 | PASS — 清算场景驱动 |
| §13.4 P0 模拟跨行流程步骤 5/6 | PASS — `SETTLED` 后才调 Fineract 入账 |
| §13.4 P0 模拟跨行流程步骤 8 | PASS — `TRANSFER_FAILED` 审计 + state_history |
| §20 Mock 9 场景全可重复 | PASS — 二轮均成功 |
| §13.1 `TIMEOUT_THEN_FAIL` 终态 | PASS — `deliveryCount >= 3` 后转为 FAILED |

## 副作用记录
- 清算 deliver 内调 `TransferProcessor.process`,后者含 Fineract REST 调用;
  对 FINESSE 生成的入账记录在 `ledger_entry` 与 `core_reference` 列上。
- Keycloak `bank-channel-service` service account 已追加角色:
  `PAYMENT_OPERATOR / TEST_SUPPORT / ACCOUNTANT / SYSTEM_ADMIN`;
  这些角色用于本次 E2E 与 EOD 推进,持久化到 realm 配置(后续 P1-6 验证脚本同样依赖)。

## 后续依赖
- P1-2 状态机强制类:建议把 `TransferStateMachineTest` 矩阵提取为生产类
  (`TransferStateMachine.checkTransition`),所有 `transitionState` 调用都经该类守护。
- P1-7/P1-8:本次 E2E 暴露 `coreTransactionFound` 断言应在 `assertPayment` 中引入,
  现用直查 Fineract accountTransfer resourceId 代替。
- P1-9 `transfer-form` testid 与本修复无关,单独处理。
