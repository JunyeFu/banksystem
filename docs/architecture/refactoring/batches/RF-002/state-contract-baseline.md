---
id: DOC-ARCH-RF002-STATE-CONTRACT-BASELINE
title: RF-002 状态契约考古基线（现状 → 目标差异表）
document_type: reference
domain: architecture
status: verified
authority: evidence
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-002 状态契约考古基线

## 1. 现状事实（2026-08-03，代码级确认）

| # | 位置 | 事实 |
|---|---|---|
| A1 | `harness/src/server.ts` L684/L702 | `/v1/i8/candidates:get` → `service.getI8Candidate(namespace, preparationId)`；`/v1/i8/tasks:get` → `service.getTask(namespace, taskId)`；均 `omitNullValues` 输出，无状态语义增强 |
| A2 | `harness/src/service.ts` getI8Candidate (L1254+) | 返回 plan_status/job_status/candidate_status/stability_status/nextAction/版本与证书字段；**无 `terminal`、无 `verificationGate`** |
| A3 | `mcp/src/server.cjs` task_get | `withVerification()` 二次调用 `/v1/i10/verification:get`(taskRef)，把验证挑战投影为 `status:'WAITING_USER', nextAction:'HUMAN_VERIFICATION_REQUIRED'`；硬编码 `terminal={SUCCEEDED,FAILED,BLOCKED,WAITING_USER,CANCELLED}`；750ms 轮询 |
| A4 | `mcp/src/server.cjs` candidate_get | 硬编码 `terminalActions={HUMAN_DELIVERY_DECISION_REQUIRED,ACTIVATE_OR_REJECT_AVAILABLE,ON_DEMAND_RUN_AVAILABLE,CANDIDATE_REPAIR_REQUIRED,AUTHORING_REVIEW_REQUIRED,NONE}`；超时后同样把 verification 投影为候选状态 |
| A5 | `harness/src/i10/service.ts` | 验证挑战状态机：`i10_verification_challenges`（WAITING_USER_PREPARATION→WAITING_USER_ACTION→VERIFICATION_CONFIRMED/CANCELLED）+ `i10_verification_events` 事件表 + 版本号；`verification:get` 支持 taskRef 查询 |

**结论**：业务状态权威数据在 Harness SQLite；状态语义推断（终止集合、verification→任务/候选投影、跨端点聚合）当前由 MCP 硬编码持有（target-design F1-F3/F8）。

## 2. 现状 → 目标差异（G1/G2/G3，target-design v2.0）

| 契约点 | 现状（A#） | 目标（G#） | 差异 |
|---|---|---|---|
| tasks:get 验证门槛 | 无字段；MCP 二次调用+投影（A3） | `verificationGate?: {challengeId,status,kind,resumeAllowed}`（活跃挑战时返回） | G1：Harness 查询 `i10_verification_challenges` 按 task_ref 返回 |
| tasks:get 终止语义 | MCP 硬编码 terminal 集合（A3） | `terminal: boolean`（Harness 判定：status∈{SUCCEEDED,FAILED,BLOCKED,WAITING_USER,CANCELLED} 或 verificationGate 存在） | G3：字段必现 |
| candidates:get 终止语义 | MCP 硬编码 terminalActions 集合（A4） | `terminal: boolean`（nextAction ∉ 终止集 ⟺ false） | G2：字段必现 |
| candidates:get 验证门槛 | MCP 超时后二次调用+投影（A4） | `verificationGate`（同 G1 语义） | G2 |
| verification:get taskRef | 已支持（A5） | 保持 | 无差异（双源一致性由 S2 合同测试断言） |

## 3. 基线断言（rf002-s1-state-contract-baseline.test.cjs）

- 断言 A2：getI8Candidate 返回对象构造中无 `terminal`/`verificationGate` 键（S2 前现状缺口登记）
- 断言 A3：server.cjs 含 `withVerification` 与 task_get 硬编码 terminal 集合
- 断言 A4：server.cjs 含 candidate_get 硬编码 terminalActions 集合
- 断言 A5：harness i10 验证挑战状态机 SQL 存在（WAITING_USER_PREPARATION/WAITING_USER_ACTION）与 verification:get taskRef 路由
- 这些断言是 S2/S3 切换的**反向锚点**：S2 完成后"无字段"断言将更新为"有字段"，S3 完成后"硬编码集合"断言将删除——防止回归

## 4. 实现状态（2026-08-03，S2 已落地）

| 契约点 | 状态 | 证据 |
|---|---|---|
| tasks:get verificationGate | ✅ G1 已实现（活跃挑战三分支：有/无/过期；resumeAllowed=WAITING_USER_ACTION） | `harness/src/service.ts` getTask + `rf002-s2-state-contract.test.cjs` |
| tasks:get terminal | ✅ G3 已实现（SUCCEEDED/FAILED/WAITING_USER/CANCELLED 或 run_status=BLOCKED 或 gate 存在） | 同上 |
| candidates:get terminal/verificationGate | ✅ G2 已实现（nextAction 终止集判定 + job_id→task_ref gate） | `harness/src/service.ts` getI8Candidate + 同上 |
| 双源一致性 | ✅ verificationGate 与 verification:get 同源（i10_verification_challenges），合同测试断言 | `rf002-s2-state-contract.test.cjs` |
| S1 反向锚点 | ✅ A2 已翻转为"有字段"（A3/A4 MCP 锚点留待 S3） | `rf002-s1-state-contract-baseline.test.cjs` |

## 5. 证据来源

- `harness/src/server.ts`、`harness/src/service.ts`、`harness/src/i10/service.ts`
- `mcp/src/server.cjs`
- `docs/architecture/refactoring/batches/RF-002/target-design.md`（v2.0 已批准）
