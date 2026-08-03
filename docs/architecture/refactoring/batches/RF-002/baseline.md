---
id: DOC-ARCH-RF002-BASELINE
title: RF-002执行基线冻结记录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-002执行基线冻结记录

- 仓库HEAD：`3582a64`（feat(rf001): close MCP-Harness contract standardization with canonical error envelope cutover）
- 分支：`RF-002`（自 `RF-001` 创建；RF-001 已 CLOSED 并推送 `github/RF-001`）
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`（与 RF-001 相同——RF-002 不改变身份输入）
- Flowise：v7，公开API回读（2026-08-03T02:21Z）`deployed=true`，sourceFlowSha256=`65bc36cd…`、deployedFlowDataSha256=`ae3f51ac…`、chatbotConfigHash=`706f5398…` 与基线一致
- Harness迁移：`36/36`；18链账本：`18/18`，9组`SEMANTIC_MATCH`，记录级身份全部`632ad5ee`
- MCP公开面：33个命名工具；生产默认8字段规范错误信封（B4-S4切流）；`HENGZHUN_RF001_LEGACY_ERROR=1`回退开关可用
- 工作区：提交 `3582a64` 后干净（RF-002 基线快照）
- 运行身份：正式环境四服务运行中（Flowise 3006/Harness 18788/MCP 18789/Worker），生产 MCP 影子关闭

## RF-002 范围状态

v54 实施顺序条目7：`RF-002`：状态所有权重构保持待定；RF-001未关闭前不得启动。RF-001 已于2026-08-03 CLOSED，RF-002 获准启动。

**本基线只冻结执行起点与批次骨架，不授权任何实施。** RF-002 的具体变化轴（状态所有权重构的目标边界、允许/禁止路径、预算）以 `target-design.md` 与 `batch.yaml` 细化并经用户批准为准；未细化前按 RC-D0 拦截任何执行请求。

候选范围线索（来自 RF-001-B1 考古与 B2 决策，仅作 target-design 输入，不构成授权）：
- RF001-F05：`candidate_get`/`schedule_get`/`result_inbox_list` 混合读写或确认副作用——条件写已显式化（B2），状态所有权归属待定
- 读取后写入复合工具（candidate_decide/schedule_disable/decision_submit）的预读版本绑定：状态由谁持有
- `candidate_get`/`task_get` 的轮询与状态投影（MCP 将 verification 状态投影为任务状态）：投影所有权
- Journey 紧凑投影与根别名（B2决策3：只由MCP生成）与 Harness journey 状态机的边界

工作区在本基线建立前不包含 RF-002 相关改动；`gitCommit 3582a64` 为回滚点。
