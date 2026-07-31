---
name: hengzhun-evidence-discipline
version: 1.0.0
description: "衡准回归平台证据纪律与身份管理协议：完成口径先行、状态只复算不书写、行为测试、度量定参、守卫跟随能力、单一事实源、身份冻结窗口纪律，以及每轮收尾的下一段提示词格式。在 hengzhun-regression-system 导出包或 banksystem 仓库中执行任何实现/修复/验收/测试/发布任务时触发；涉及账本、ReleaseIdentity、18 链验收、Flowise 发布、recover 续跑、backlog 或能力矩阵状态时强制适用。"
metadata:
  origin: "I10 18-chain repair session 2026-07-31 (12 defects, 0/18 -> 2/18)"
---

# 衡准证据纪律（2026-07-31 I10 修复实战沉淀）

本文件是唯一权威：当文档、backlog、能力矩阵、方案计划与本文件冲突时，以**可复算命令的当前输出**为准。

## 一、九条原则（每条都有失败案例）

1. **完成口径先行，且只能是端到端口径。** 开工前写下"done = 哪条命令的哪行输出"。候选生成、2x2、激活、单项测试绿都是中间态，永远不许升级为"完成"。
2. **一条细链先绿，再谈宽度。** 新链路先用最笨案例端到端跑通一次，才允许加第二层。教训：跨会话链在从未完整跑通的情况下叠加了四个缺失（执行计划门、run_submit、真实激活、终态读取）。
3. **状态只能计算，不能书写。** DONE/PASSED/已发布/测试数必须能由一条命令现场复算；不能复算的不写进任何文档/backlog/矩阵。历史证据必须绑定身份（Hash/版本）并自动失效。教训：方案写"已发布/208 项通过"时，磁盘上分别是"未发布/2 红"；backlog 标 DONE 时账本 0/18。
4. **测试断言行为和不变量，不断言源码和时间点。** 评审每个新测试问一句："现实变好了它会不会变红？"会的就是坏测试。教训：`deploymentReady === false`、断言源码含 `businessInputs` 字面量，全绿时 18 链 100% 跑不通。
5. **参数来自度量分布，不来自推理。** 非确定性依赖（模型/OCR/浏览器）先打 N≥5 发看失败模式再定预算/超时/重试；推理类模型预算按"推理+回答"两份算（教训：deepseek-v4-flash 在 2048 maxTokens 下约 60% 请求推理耗尽预算返回空内容）；暂断必须有界重试，副作用必须有幂等键——两者都是设计输入，不是事后补丁。
6. **测试不得改变被测状态。** 测试链里的重建/重置动作要么在隔离副本上做，要么结束前恢复；"测试后身份不变"本身应是检查项。教训：`test:i10:journey` 重建 v7 会把发布清单重置为未发布，当前 ReleaseIdentity 直接失效。
7. **守卫跟在能力后面。** 先证明 happy path 能到终点，再加 fail-closed、回归守卫、防重放。顺序反了，正确的守卫会拦住修复路径（教训：checkpoint 守卫拦住了 recover）。
8. **单一事实源，回灌按天不按周。** banksystem 仓库是唯一源，导出包是产物；代码进仓库的同一次变更里更新 backlog/矩阵/证据文档。教训：分叉一轮 = 回灌 185 个文件。
9. **对 AI 生成物执行同一套证据纪律。** 任何"已修复/已完成"结论都必须附复跑命令和输出；没有命令证据的叙述一律视为未验证。

## 二、完成口径格式（每个任务开工前必写）

```
done = <命令> 的 <期望输出>（端到端、当前 ReleaseIdentity）
```

本项目标准复算命令（在导出包根目录执行，node 用 `runtime/node-v20.20.2-win-x64/node.exe`）：

- 账本：`scripts/i10-acceptance-ledger-v3.cjs status` → `currentPassed` / `identityHash` / `historicalStale`
- 18 链与配对：`scripts/i10-18-chain-acceptance-live.cjs status` → `passed` / 每案例 `pairStatus`
- 服务与业务就绪：`scripts/i9-lifecycle.cjs status` → `HEALTHY` + `businessReadiness: READY`
- 测试：`npm run test:i10:journey`（**注意：它会重建 v7 并重置发布清单，跑完必须重发布**，见第四节）

## 三、身份冻结纪律（18 链收口前强制）

以下文件是 ReleaseIdentity 承载文件，改动即作废当前全部已积累记录：

- `harness/src/i10/service.ts`（harnessCodeHash）
- `worker/src/i10-midscene-candidate-authoring.cjs`（workerCodeHash）
- `flowise/i10/agentflow-v*.json` 及其构建器（sourceFlowHash/normalizedFlowHash）
- 迁移版本、案例目录 `contracts/i10/case-catalog-v1.json`

窗口期内：缺陷修复优先落在**非身份文件**（验收驱动 `scripts/i10-18-chain-acceptance-live.cjs`、`scripts/i10-stage8-live.cjs`、MCP `mcp/src/server.cjs`、测试、文档）；确需动身份文件时，先停下报告，攒批一次改完并接受"受影响记录全部重跑"。

## 四、标准仪式（顺序即纪律）

1. 验收前：静态验证（`verify-i10-agentflow-v7` + `verify-i10-final-standardization`）+ 关键测试 + 账本 status 确认身份未漂移。
2. 全量测试后：`scripts/i10-agentflow-publish.cjs --allow-register` 重发布（哈希确定性，身份可复原），再 `i10-acceptance-ledger-v3.cjs status` 确认 identityHash 复原。
3. 链失败：按错误码定位→修复→用 `recover <案例> <变体> <run目录>` 续跑（FAILED_RECOVERABLE + RECOVER_IN_PLACE_REQUIRED 时**不得**开新 run，checkpoint 守卫会拒）；只有 `NO_SIDE_EFFECT_CONFIRMED` 才能重新 `run`。
4. 服务重启：`i9-lifecycle.cjs stop` 后 `powershell -File scripts/start-i10.ps1`（含探针与发布，幂等）；改 harness/worker 代码后必须重启，改 MCP 代码后必须重启 MCP。

## 五、每轮收尾格式（对用户的固定输出）

每轮任务结束必须给出：

1. **当前可复算状态**（附命令与关键输出，不是叙述）。
2. **下一步建议**（按方案顺序：L1-L3 → M1-M3 → H1-H3，每例文本变体先于图片变体）。
3. **下一段提示词**，四段式：

```
<动作>，done = <复算命令> 的 <期望输出>。
证据锚点：<当前账本/测试/服务状态的命令输出摘要>。
执行顺序：<前置测试> → <构建/发布恢复> → <正式动作>。
禁止事项：不绕过 checkpoint 守卫、不补写账本或证据、不手写状态、不用历史证据冒充当前通过；冻结纪律见本文件第三节。
```

## 六、已知欠账（修复前不得声称覆盖）

- STATUS 不接 ReleaseIdentity/账本（发布后改图仍报 READY）；单次写入只有声明（图内存在双写路径）；OUTCOME_UNKNOWN 副作用对账未实现；MCP 代码不在身份哈希内；H3 收款人/金额无数值比对；48 条中断注入组合未执行；18 链无批量执行入口。
