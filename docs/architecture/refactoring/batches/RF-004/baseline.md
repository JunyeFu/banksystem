---
id: DOC-ARCH-RF004-BASELINE
title: RF-004执行基线冻结记录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004执行基线冻结记录

- 仓库HEAD：`70cf25f`（feat(rf003): S3 production cutover, observation and batch close）
- 分支：`RF-004`（自 `RF-003` 创建；RF-003 已 CLOSED 并推送 `github/RF-003`）
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`
- 凭据绑定现状（F08 变化轴）：
  - MCP `run_submit`/`schedule_create`：`normalizeCredentialBinding` 冻结注入 `credentialAlias: 'i3-customer'`（RF-001 B2 决策 8 登记：仅旧兼容行为，通用目标前须由权威执行凭据绑定替代）
  - Harness `enqueueRun`（service.ts L308-350）：credentialAlias 写入 task payload 与 runs 表 → Worker 领取后解析门户凭据
  - Harness 候选验证路径（L1670）：`credentialAlias: 'i3-customer'` 硬编码，但 `I10_2X2_V1` 且 case definition 含 credentialRef 时已透传 credentialRef + entryUrl
  - v7 消费者：run_submit/schedule_create 均不传 credentialAlias（MCP 注入）→ 迁移面在 MCP/Harness 内部，Flowise 零改动
- 工作区：提交 `70cf25f` 后干净；正式环境四服务运行中（RF-003 切流后状态）

## RF-004 范围

v54 L1 全景 RF-004（CANDIDATE→解禁 2026-08-03）：执行凭据绑定迁移（F08）。本基线只冻结执行起点，实施需 target-design 细化并经用户批准（RC-D0）。
