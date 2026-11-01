---
id: DOC-ARCH-RF049-EVIDENCE
title: RF-049 转账结果收敛证据
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-049 转账结果收敛证据

## 业务目标

Fineract 继续作为唯一账务真相源。渠道收到明确成功、明确拒绝或不确定结果时，不得因为本地事务回滚、网络超时或响应丢失产生第二次扣款，也不得把渠道投影称作第二套总账。

## 根因与实现

| 根因 | 实现结果 |
|---|---|
| `TransferProcessor.process()` 和客户确认接口把 Fineract 网络调用包在本地事务中 | `TransferProcessor` 改为三个短事务：准备/认领提交、Fineract 网络调用、核心回读后的本地收敛；确认接口移除外层事务。 |
| 4xx、5xx、超时、丢响应和缺失 resource id 全部落为 `FAILED` | 只有明确 4xx 且同键回读为空才进入 `FAILED`；其他不确定结果进入 `CORE_RESULT_UNKNOWN`。 |
| 重入 `PENDING_CLEARING` 会再次 POST | 首次提交前持久化 `core_submission_started_at`；已认领、`PENDING_CLEARING` 和 `CORE_RESULT_UNKNOWN` 只执行读回，不再提交。 |
| POST 响应被当作结算事实 | Fineract transfer id、来源账户、目标账户、金额和以同一核心键生成的唯一 description 回读一致后，才写 `SETTLED` 与 `core_verified_at`。 |
| 渠道投影命名为 `ledger_entry` | 数据表、测试支撑接口、脚本与前端字段统一改为 `transfer_accounting_projection` / accounting projection；Fineract journal 保留 ledger 语义。 |
| 宽泛异常捕获吞掉本地提交失败 | 捕获范围缩到 Fineract POST；本地收敛失败原样抛出，重入仅回读核心且不会第二次 POST。 |

## 合同与迁移

- 新增状态 `CORE_RESULT_UNKNOWN`，路径为 `PENDING_CLEARING -> CORE_RESULT_UNKNOWN -> SETTLED|FAILED`。
- 新增迁移 `v11-transfer-core-convergence.yaml`：重命名渠道投影表，增加 `(transfer_id, account_id)` 唯一约束和 `core_submission_started_at`、`core_verified_at`。
- 测试支撑读接口改为 `/internal/test-support/v1/assertions/accounting-projection/{correlationId}`。
- OpenAPI、AsyncAPI、共享领域类型、UI 状态文案与处理中统计已同步。
- ADR-004 明确远程调用事务边界、未知结果和权威回读规则。

## 验证

| 层级 | 命令/环境 | 结果 |
|---|---|---|
| STATIC | `git diff --check`（RF-049 路径） | PASS |
| CONTRACT | 7 份 OpenAPI/AsyncAPI/Liquibase YAML 解析 | PASS |
| UNIT/COMPONENT | Java 21 容器执行 `mvn -q test` | PASS，60/60 |
| ROOT-CAUSE FEATURES | `TransferProcessorTest`、`FineractTransferReadbackTest`、`TransferStateMachineTest` | PASS；覆盖明确拒绝、丢响应、UNKNOWN 重入、本地提交失败及无第二次 POST |
| FRONTEND | Customer Portal 与 Operations Console `npm run build` | PASS |
| MIGRATION | 一次性 PostgreSQL 18.3 空库启动应用迁移 | PASS；仅存在 `transfer_accounting_projection`，两个核心边界时间列存在 |
| FINERACT SANDBOX | 当前 Fineract `GET /accounttransfers` 分页回读 | PASS，HTTP 200、`totalFilteredRecords/pageItems` 合同可用；沙箱当前无 transfer，未执行资金写入 |
| KEEPALIVE | 当前 Docker 服务清单 | PASS，15 个既有容器保持运行，未重启或停止 |

## 完成边界

RF-049 工程实现进入 `REVIEW`。本批改变源码、合同和迁移，影响 ReleaseIdentity；未冻结或激活新身份，未重建当前银行服务，未执行资金写入 LIVE_E2E，也不继承旧身份证据。当前运行服务保持原版本，等待后续受控身份冻结与部署验证。
