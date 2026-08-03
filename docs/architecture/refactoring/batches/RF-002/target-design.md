---
id: DOC-ARCH-RF002-TARGET
title: RF-002目标设计——状态所有权收敛（MCP业务状态推断 → Harness权威状态契约）
document_type: design
domain: architecture
status: PROPOSED
authority: normative
version: 2.0
effective_date: 2026-08-03
owner: project-owner
supersedes: v1.0占位（2026-08-03）
---

# RF-002目标设计

## 1. 现状事实（代码级，2026-08-03）

| # | 位置 | 现状 | 状态所有权 |
|---|---|---|---|
| F1 | `mcp/src/server.cjs` `task_get` | `withVerification()` 额外调用 `/v1/i10/verification:get`（taskRef），把验证挑战状态**投影**为任务状态：`status:'WAITING_USER', nextAction:'HUMAN_VERIFICATION_REQUIRED'` | MCP 跨端点聚合+投影 |
| F2 | 同上 | 轮询终止集合硬编码：`terminal = {SUCCEEDED,FAILED,BLOCKED,WAITING_USER,CANCELLED}`；750ms 轮询循环 | MCP 持有终止语义 |
| F3 | `mcp/src/server.cjs` `candidate_get` | 终止集合硬编码：`terminalActions = {HUMAN_DELIVERY_DECISION_REQUIRED,ACTIVATE_OR_REJECT_AVAILABLE,ON_DEMAND_RUN_AVAILABLE,CANDIDATE_REPAIR_REQUIRED,AUTHORING_REVIEW_REQUIRED,NONE}`；同样把 verification 投影为候选状态 | MCP 持有终止语义 |
| F4 | `mcp/src/server.cjs` `candidate_decide`/`schedule_disable`/`decision_submit` | 预读（candidates:get/schedules:get/failures:get）→ 提取版本 → 乐观并发写（expectedVersion） | 版本绑定由 MCP 组装（Harness 校验） |
| F5 | `mcp/src/server.cjs` `schedule_get` | `action=DISABLE` 条件写路径（与 `schedule_disable` 重叠） | 写所有权在 Harness，双入口 |
| F6 | `mcp/src/server.cjs` `result_inbox_list` | `acknowledgeInboxIds` 确认已读副作用（查询+写混合） | 写所有权在 Harness |
| F7 | `harness/src/i10/service.ts` | `i10_verification_challenges` 表状态机（WAITING_USER_PREPARATION→WAITING_USER_ACTION→VERIFICATION_CONFIRMED/CANCELLED）+ `i10_verification_events` 事件表 + 版本号；`tasks` 表（status/progress/version） | Harness SQLite 权威 |
| F8 | `harness` tasks:get 响应 | **不含** verification 门槛字段——MCP 必须二次调用 verification:get 才能合成"等待人工验证"状态 | 聚合缺口 |

**结论**：业务状态（任务/候选/调度/验证挑战/事故）的**权威数据**在 Harness SQLite；但**状态语义推断**（终止集合、verification→任务投影、跨端点聚合）当前由 MCP 硬编码持有。RF-002 的变化轴 = 把这些语义推断收敛为 Harness 权威状态契约的显式字段。

## 2. 单一变化轴（本批次唯一授权）

**MCP 不再推断业务状态**：Harness 状态端点显式返回状态语义字段（`terminal` 标志、`verificationGate`、权威 `nextAction` 枚举），MCP 只做：参数透传、受控轮询（waitFor* 语义由 Harness 文档化）、展示格式投影（如 `compactJourneyForFlowise`）。

**明确排除（不属本批次）**：
- 不改 SQLite 表结构、不改任何状态机迁移（i10_verification_challenges/tasks/schedules/incidents 的既有状态与事件语义冻结）
- 不改 33 工具名、13 别名、8 字段错误信封（RF-001 硬基线）
- 不做跨端点聚合的 UI 层/Flowise 层改动
- 不引入新的状态存储

## 3. 目标状态（子项级，每个都可验证）

### G1 tasks:get 显式 verificationGate（Harness 收敛）
- **现状**：tasks:get 响应无验证门槛字段；MCP `withVerification` 二次调用聚合
- **目标**：`/v1/i8/tasks:get` 响应增加 `verificationGate?: { challengeId, status, kind, resumeAllowed }` 字段——当 taskRef 存在活跃挑战（status ∈ WAITING_USER_PREPARATION/WAITING_USER_ACTION，未过期）时由 Harness 查询 `i10_verification_challenges` 返回；无活跃挑战时字段省略
- **状态归属**：Harness（SQLite 查询）；**验证**：合同测试断言字段存在性与状态一致性（与 verification:get 同源）
- **MCP 收敛**：`task_get` 删除 `withVerification` 二次调用与投影；轮询循环中若 `verificationGate` 存在则直接返回（不再调用 verification:get）；终止条件改用 G3 的 `terminal` 字段

### G2 candidate_get 终止语义收敛
- **现状**：MCP 硬编码 terminalActions 集合
- **目标**：`/v1/i8/candidates:get` 响应增加 `terminal: boolean` 字段（Harness 按状态机判定，枚举与当前 MCP 集合语义一致：HUMAN_DELIVERY_DECISION_REQUIRED / ACTIVATE_OR_REJECT_AVAILABLE / ON_DEMAND_RUN_AVAILABLE / CANDIDATE_REPAIR_REQUIRED / AUTHORING_REVIEW_REQUIRED / NONE 之外为 false）；verification 投影同 G1（若 candidates:get 关联活跃验证挑战则返回 `verificationGate`）
- **状态归属**：Harness；**验证**：合同测试断言 terminal 与 nextAction 的一致性

### G3 task_get 终止语义收敛
- **现状**：MCP 硬编码 terminal = {SUCCEEDED,FAILED,BLOCKED,WAITING_USER,CANCELLED}
- **目标**：tasks:get 响应增加 `terminal: boolean`（Harness 判定：status ∈ 上述集合 或 verificationGate 存在）
- **状态归属**：Harness

### G4 预读版本绑定保持（MCP 组装、Harness 校验）
- **现状**：candidate_decide/schedule_disable/decision_submit 预读→expectedVersion 组装
- **目标**：**保持现状语义**（Harness 已做 409 版本冲突校验与幂等）；RF-002 只把预读请求纳入状态契约审计（响应统一带 `version` 字段的可读性断言），不改变组装逻辑——本子项为"契约确认"，无行为变更
- **验证**：聚焦测试断言三个工具预读响应含可解析 version

### G5 条件写入口收口评估
- **现状**：schedule_get(action=DISABLE) 与 schedule_disable 双入口（B2决策4：保留读取兼容至B4）
- **目标**：Flowise v7 消费者审计确认 v7 是否调用 schedule_get DISABLE；若零调用 → 在 contract-delta 登记退场（`until: RF-002 consumer evidence`→退场），`schedule_get` 恢复纯读（action 枚举去除 DISABLE 需合同变更，走 maxContractsChanged 预算）；若存在调用 → 保留并登记退场门槛
- **验证**：agentflow-v7 工具节点审计 + 合同校验器

### G6 result_inbox_list 确认已读语义契约化
- **现状**：acknowledgeInboxIds 查询时确认已读（混合副作用）
- **目标**：不做行为变更；把副作用声明写入边界合同（sideEffect 已是 CONDITIONAL_MUTATION ✓）；新增静态断言"确认已读只影响 inbox 状态、不触达任务/调度状态"
- **验证**：聚焦测试静态断言 + 隔离运行态（若切片需要）

## 4. 模块所有者与依赖

| 项 | 归属 |
|---|---|
| 状态权威 | Harness（SQLite：tasks/candidates/schedules/incidents/verification_challenges + 版本 + 事件） |
| verificationGate/terminal 字段生成 | Harness 状态端点（i8 tasks/candidates 路由），只读查询，不写 |
| 轮询参数透传与循环 | MCP（waitForTerminal/waitForCertificate/waitSeconds 为受控查询语义，由 Harness 文档化） |
| 展示格式投影 | MCP（compactJourneyForFlowise 等，仅展示字段，不改变业务状态） |
| 版本绑定组装 | MCP 预读 + Harness 409 校验（保持） |
| 条件写声明 | 边界合同（sideEffect 枚举） |

允许依赖：`hengzhun.mcp` → `hengzhun.harness`（仅经冻结公开合同与显式适配器）。禁止依赖：任何 Flowise/Worker/银行模块；MCP 不得新增状态存储或状态机逻辑。

## 5. 同步/异步、超时、幂等、审计、失败关闭

- 同步/异步：G1-G3 全部为同步读（无新异步）；轮询保持 MCP waitFor* 语义（超时上限 180s 不变，超时返回 `ASYNC_TASK_RESUME`/`I8_CANDIDATE_WAIT_TIMEOUT` 等既有错误码）
- 幂等：G1-G3 只读；G4 保持；G5 若退场走既有 schedule_disable 幂等
- 审计：新增字段不新增事件；验证挑战状态事件仍由 Harness 既有 `i10_verification_events` 记录
- 失败关闭：verificationGate 查询失败 → 字段省略并登记 `I10_VERIFICATION_GATE_UNAVAILABLE`（新错误码，入合同/矩阵）；terminal 字段缺失 → MCP 按"非终止"处理但登记 `I8_TERMINAL_FIELD_MISSING`（新错误码）——**不得静默沿用 MCP 硬编码集合**
- 降级：切流期保留 RF-001 模式（影子比较 + `HENGZHUN_RF001_LEGACY_ERROR` 风格回退开关，本批次对应 `HENGZHUN_RF002_STATE_LEGACY=1` 若切片需要）

## 6. 可验证表达（禁止"统一处理/智能判断"）

- terminal：`boolean`，由 Harness 状态机判定，字段必现（tasks/candidates:get 响应）
- verificationGate：`{challengeId: string, status: enum[WAITING_USER_PREPARATION,WAITING_USER_ACTION], kind: string, resumeAllowed: boolean} | omitted`（无活跃挑战时省略）
- nextAction：保持既有枚举，`terminal=true ⟺ nextAction ∈ 文档化终止集`（合同测试机器断言）
- 每个目标子项都有合同测试或聚焦测试断言；无行为断言不得宣称完成

## 7. 切片链建议（顺序固定，前序未过不启动后序）

1. **RF-002-S1 状态契约考古与基线**：定位 tasks/candidates:get 路由实现（harness/src 路由位置确认）、冻结当前响应字段清单、错误码清单；产出状态契约差异表（零代码改动）
2. **RF-002-S2 Harness 状态契约扩展**：G1/G2/G3 字段（verificationGate/terminal）实现 + 合同测试（行为兼容：新字段可选/必现按设计，旧消费者不受影响）
3. **RF-002-S3 MCP 收敛**：task_get/candidate_get 删除投影与硬编码集合，改用 Harness 显式字段；影子比较（mismatched=0）；聚焦测试更新
4. **RF-002-S4 条件写收口与契约确认**：G5 退场审计（含合同变更预算）、G6 断言、G4 确认测试
5. **RF-002-S5 验证、切流与关闭**：隔离运行态回归、生产切流（含回退开关）、身份/18链、批次 CLOSED（复用 RF-001-B4 模式）

## 8. 预算与边界

- 沿用 `batch.yaml`：≤24 文件、≤12 新增、≤2400 行、≤2 合同变更（G5 退场可能占 1）、0 迁移、≤2 开放模块
- 禁止：SQLite 表结构/状态机迁移、Flowise/Worker/银行模块、33 工具名/13 别名/8 信封改动、MCP 新增状态存储
- 保留：ReleaseIdentity `632ad5ee`、18链 18/18、生产 8 字段信封与回退开关

## 9. 风险

- G1-G3 改 Harness 响应 → 需实时回读与 18 链复核（复用 B4-S2 模式；正式环境当前运行中）
- G5 退场若 v7 有消费者 → 不退场，登记门槛（不阻塞其他子项）
- verificationGate 与 verification:get 双源一致性 → 合同测试同源断言（同一 SQLite 行）
- 新错误码（I10_VERIFICATION_GATE_UNAVAILABLE/I8_TERMINAL_FIELD_MISSING）须入 matrix 与合同，否则 B4-S1 错误码清单测试拦截

## 10. 批准要求

本设计经用户批准后成为 RF-002 唯一变化轴授权；随后按 RC-D0 产出切片文件与任务包逐一切片执行。
