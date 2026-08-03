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
9. 2026-08-03（S4完成）：条件写收口与契约确认。G5：schedule_get 依据 v7 零 action=DISABLE 消费者证据退场（恢复纯读，移除 action/DISABLE 分支与 I8_SCHEDULE_DISABLE_CONFIRMATION_REQUIRED）；边界合同 sideEffect CONDITIONAL_MUTATION→READ_ONLY、canonicalRequest 收窄 [scheduleId]（validate_rf001_contract.py 动态计数 3→2 PASS）；权威停用路径 schedule_disable 零改动。G6：result_inbox_list 保持 CONDITIONAL_MUTATION 声明，静态断言确认已读只触达 inbox（无 schedule/task/candidate/failure 端点）。G4：candidate_decide/schedule_disable/decision_submit 预读版本绑定模式测试确认（shadowedRequest 预读+乐观锁组装+callHarness 写，行为中性）。联动断言更新（预期变更登记）：B3-S2 条件写（schedule_get 零 disable）、B4-S1 计数 2、矩阵登记 RF001-F04-RETIRED（退场码文本保留供回滚演练 corpus——B4-S3 演练基线恢复含该码需保持文档化）。rf002-s4-conditional-writes.test.cjs 4/4；聚焦 56/56、校验器×3、身份 632ad5ee、git diff --check 全过。**RC-D1同步链**：任务包→切片→contract-delta（G5 退场）→target-design（G5 已执行）→L2 衔接点 C3 闭合（消费者审计方法论复用）→batch；无顶层冲突。
8. 2026-08-03（S3完成，DP-S3-1选A）：MCP状态推断收敛。G1.1 gate展示字段扩展（verificationGate增加version/verificationType/userPreparation，S2已冻结字段不变）；task_get删除withVerification与硬编码terminal Set，轮询终止=body.terminal；candidate_get删除terminalActions Set与跨端点verification:get，轮询终止=body.terminal；展示投影（冻结映射）：gate存在→status:'WAITING_USER'/nextAction:'HUMAN_VERIFICATION_REQUIRED'/verification对象（全部来自gate字段，零跨端点调用）。DP-S3-1（target-design G1"不再调用verification:get"与v7消费verification.version/type/preparation冲突）经用户批准选A。S1 A3/A4锚点翻转为"已删除"断言；S2 gate断言扩展。rf002-s3-mcp-convergence.test.cjs：隔离运行态断言展示投影正确+**零verification:get调用**（计数代理）+无gate直通；聚焦52/52、校验器×3、身份632ad5ee、git diff --check全过。**RC-D1同步链**：任务包→切片→target-design（G1.1/DP-S3-1记录）→state-contract-baseline（MCP收敛完成）→L2（C1保持）→batch；无顶层冲突。
7. 2026-08-03（S2完成）：Harness状态契约扩展G1/G2/G3落地。getTask附加verificationGate（活跃挑战：WAITING_USER_PREPARATION/ACTION且未过期，无则省略；resumeAllowed=WAITING_USER_ACTION）与terminal（SUCCEEDED/FAILED/WAITING_USER/CANCELLED或run_status=BLOCKED或gate存在）；getI8Candidate重构nextAction为Harness自有变量并附加terminal（终止集与MCP现状一致）与verificationGate（job_id→task_ref）。零表结构/状态机/迁移变更；MCP零改动（S3收敛）。合同测试rf002-s2-state-contract.test.cjs：tasks五分支、candidates两分支、双源一致性（verificationGate与verification:get同源）、身份632ad5ee；聚焦51/51（含S1锚点翻转）、校验器×3、git diff --check全过；dist重新构建。L2衔接点C1生效：RF-003将新契约纳入统一版本管理。**RC-D1同步链**：任务包→切片→state-contract-baseline（G1-G3已实现）→L2预规划（C1登记）→batch；无顶层冲突。
6. 2026-08-03（L1全景+target-design批准，S1完成）：用户批准 L1 重构全景规划（v54 重构章节重写：终态指标/批次全景 RF-000..RF-005/绞杀者执行模式/缺陷归属登记）与 RF-002 target-design v2.0（状态所有权收敛：Harness 暴露 terminal/verificationGate；MCP 删除业务状态推断）。backlog 同步：RF-001→DONE，RF-002/RF-003/RF-004/RF-005 登记（候选不授权）。RF-002-S1（状态契约考古与基线）完成：机器断言现状缺口（A2 无 terminal/verificationGate、A3/A4 MCP 硬编码集合与跨端点投影、A5 验证状态机+taskRef），产出 `state-contract-baseline.md` 差异表（现状→G1/G2/G3）；聚焦 48/48（含 RF-001 回归 43）、校验器×3、git diff --check 全过；零运行时代码改动。**RC-D1同步链**：任务包→切片→state-contract-baseline→batch（PROPOSED 保持）→L1（v54 无改动）；无顶层冲突。S2（Harness 契约扩展）为下一门禁。

10. 2026-08-03（S5完成，**RF-002批次CLOSED**）：生产切流、观察与批次关闭。受管 stop→start-i10.ps1（新 dist Harness 加载 G1/G2/G3/G1.1、新 MCP 加载 S3 收敛+S4 退场）；四服务健康、模型探针 mock=false、发布回读三项 Hash 与基线一致。生产实时探测：task_get/schedule_get/verification_get/candidate_get 全部规范 8 字段信封且 errorCode 保留；schedule_get 纯读（实现事实：action 参数被 zod strip 忽略而非 schema 拒绝——行为等同纯读、不会触发停用，已如实记录）。观察：身份 632ad5ee、18 链 18/18、生产影子保持关闭。批次关闭：batch.yaml PROPOSED→CLOSED（validate_refactoring PASS）、v54 RF-002 条目更新+RF-003 解禁登记、backlog RF-002 DONE、L2 衔接点 C1/C5 生效。**RC-D1同步链**：任务包→切片→batch（CLOSED）→v54→backlog→L2 预规划（C1/C5）；无顶层冲突。回退通道：git 恢复+受管重启（硬回退），RF-001 LEGACY_ERROR 软回退保持。
