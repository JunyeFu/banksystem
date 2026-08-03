---
id: DOC-ARCH-RF002-DECISIONS
title: RF-002决策记录
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-002决策记录

1. 2026-08-03：RF-001批次CLOSED后，用户指示进入RF-002分支并建立执行基线。
2. RF-002分支自`RF-001`（HEAD`3582a64`）创建；工作区干净；ReleaseIdentity`632ad5ee`、18链18/18、33工具面与8字段规范信封为执行起点。
3. **范围未细化声明**：v54条目7仅授权"状态所有权重构"之名；本批次`batch.yaml`的includePaths为候选路径（RF-001-B1考古线索：条件写/读取后写入复合工具/轮询状态投影/Journey投影所有权），**不构成实施授权**。按RC-D0，target-design细化并经用户批准前，任何RF-002执行请求将被拦截。
4. 执行基线已冻结：`baseline.md`记录HEAD、身份、运行身份、回滚点与候选范围线索；`batch.yaml`为PROPOSED草案（校验器可过，含范围待细化标注）。
5. 本阶段只建立分支与基线，不实施、不提交运行时代码；基线文档提交需用户确认。
7. 2026-08-03（S2完成）：Harness状态契约扩展G1/G2/G3落地。getTask附加verificationGate（活跃挑战：WAITING_USER_PREPARATION/ACTION且未过期，无则省略；resumeAllowed=WAITING_USER_ACTION）与terminal（SUCCEEDED/FAILED/WAITING_USER/CANCELLED或run_status=BLOCKED或gate存在）；getI8Candidate重构nextAction为Harness自有变量并附加terminal（终止集与MCP现状一致）与verificationGate（job_id→task_ref）。零表结构/状态机/迁移变更；MCP零改动（S3收敛）。合同测试rf002-s2-state-contract.test.cjs：tasks五分支、candidates两分支、双源一致性（verificationGate与verification:get同源）、身份632ad5ee；聚焦51/51（含S1锚点翻转）、校验器×3、git diff --check全过；dist重新构建。L2衔接点C1生效：RF-003将新契约纳入统一版本管理。**RC-D1同步链**：任务包→切片→state-contract-baseline（G1-G3已实现）→L2预规划（C1登记）→batch；无顶层冲突。
6. 2026-08-03（L1全景+target-design批准，S1完成）：用户批准 L1 重构全景规划（v54 重构章节重写：终态指标/批次全景 RF-000..RF-005/绞杀者执行模式/缺陷归属登记）与 RF-002 target-design v2.0（状态所有权收敛：Harness 暴露 terminal/verificationGate；MCP 删除业务状态推断）。backlog 同步：RF-001→DONE，RF-002/RF-003/RF-004/RF-005 登记（候选不授权）。RF-002-S1（状态契约考古与基线）完成：机器断言现状缺口（A2 无 terminal/verificationGate、A3/A4 MCP 硬编码集合与跨端点投影、A5 验证状态机+taskRef），产出 `state-contract-baseline.md` 差异表（现状→G1/G2/G3）；聚焦 48/48（含 RF-001 回归 43）、校验器×3、git diff --check 全过；零运行时代码改动。**RC-D1同步链**：任务包→切片→state-contract-baseline→batch（PROPOSED 保持）→L1（v54 无改动）；无顶层冲突。S2（Harness 契约扩展）为下一门禁。
