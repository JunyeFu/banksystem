# RF-002-S1 切片计划：状态契约考古与基线（零代码改动）

## 背景（已批准）
- L1 重构全景规划已批准（v54 重构章节重写，2026-08-03）
- RF-002 target-design v2.0 已批准：状态所有权收敛（Harness 暴露 terminal/verificationGate 契约；MCP 删除业务状态推断）
- 批次：RF-002 batch.yaml PROPOSED；backlog 已登记（REFACTOR-RF-002-STATE-OWNERSHIP）
- 分支 RF-002，提交 681145d + a9058d2

## 考古事实（已确认，代码级）
| # | 事实 | 证据 |
|---|---|---|
| A1 | `/v1/i8/candidates:get` → `service.getI8Candidate(namespace, preparationId)`；`/v1/i8/tasks:get` → `service.getTask(namespace, taskId)`；均 `omitNullValues` 输出 | harness/src/server.ts L684/L702 |
| A2 | getI8Candidate 返回 plan/job/candidate/batch/cert/authoring/delivery 字段（含 nextAction），**无 terminal、无 verificationGate** | harness/src/service.ts L1254+ |
| A3 | MCP task_get：`withVerification()` 二次调用 `/v1/i10/verification:get`(taskRef) 并投影 `status:'WAITING_USER'`；硬编码 `terminal={SUCCEEDED,FAILED,BLOCKED,WAITING_USER,CANCELLED}` | mcp/src/server.cjs task_get |
| A4 | MCP candidate_get：硬编码 `terminalActions={HUMAN_DELIVERY_DECISION_REQUIRED,ACTIVATE_OR_REJECT_AVAILABLE,ON_DEMAND_RUN_AVAILABLE,CANDIDATE_REPAIR_REQUIRED,AUTHORING_REVIEW_REQUIRED,NONE}` + verification 投影 | mcp/src/server.cjs candidate_get |
| A5 | verification:get 支持 taskRef 查询；Harness 验证挑战状态机 WAITING_USER_PREPARATION→WAITING_USER_ACTION→VERIFICATION_CONFIRMED/CANCELLED（i10_verification_challenges 表） | harness/src/i10/service.ts |

## S1 交付物
1. `docs/architecture/refactoring/batches/RF-002/slices/RF-002-S1.yaml`（切片定义）
2. `docs/architecture/refactoring/batches/RF-002/tasks/RF-002-S1.md`（任务包）
3. `docs/architecture/refactoring/batches/RF-002/state-contract-baseline.md`（状态契约差异表：现状 A1-A5 → 目标 G1/G2/G3）
4. `platform/hengzhun-regression-system/scripts/verification/rf002-s1-state-contract-baseline.test.cjs`（新增考古基线测试，机器断言 A2/A3/A4/A5 现状，为 S2/S3 可测切换锚点）
5. 证据更新：decision-log（条目 6）、evidence-index

## 命令级 done 条件
```text
① node --test scripts/verification/rf002-s1-state-contract-baseline.test.cjs → 全过（现状基线断言）
② 全聚焦回归（RF-001 七个文件 43 项）→ 全过（S1 零代码改动不破坏基线）
③ validate_refactoring.py（batches=3）+ validate_rf001_contract.py + validate_docs.py → PASS
④ git diff --check → PASS
```

## 预算
maxChangedFiles 6 / maxNewFiles 3 / maxChangedLines 300 / 0 合同 / 0 迁移 / 0 模块（零运行时代码改动）

## 执行顺序
S1-1 写切片+任务包 → S1-2 写状态契约差异表 → S1-3 写考古基线测试 → S1-4 验证（测试+回归+校验器）→ S1-5 RC-D1 同步（decision-log 条目 6、v54 无改动、backlog 不涉及）→ 提交
