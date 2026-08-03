---
id: DOC-ARCH-RF005-BASELINE
title: RF-005执行基线冻结记录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005执行基线冻结记录

- 仓库HEAD：`d914998`（feat(rf004): S4 production cutover, observation and batch close）
- 分支：`RF-005`（自 `RF-004` 创建；RF-004 已 CLOSED 并推送 `github/RF-004`）
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`
- 双路由现状（F07 变化轴）：
  - MCP `case_prepare`：i10/i8 双路由——`draft.schemaVersion === 'hengzhun-i10-case-draft-v1' || typeof draft.credentialRef === 'string'` → i10（`/v1/i10/cases:prepare`）；否则 i8（`/v1/i8/cases:prepare` + acceptanceSummaryJson）
  - v7 消费者：case_prepare 仅传 `draftJson`（i10 草案）+ credentialRef + journeyId；draftArray/acceptanceSummaryJson/multimodalContextJson **零调用**（B3-S3 审计与 S4 复核确认）
  - 边界合同 case_prepare aliases：draftArray/draftJson/acceptanceSummaryJson/multimodalContextJson（13 计数的一部分）
- 工作区：提交 `d914998` 后干净；正式环境四服务运行中（RF-004 切流后状态）

## RF-005 范围

v54 L1 全景 RF-005（CANDIDATE→解禁 2026-08-03）：case_prepare I10/I8 双路由退场与 I8 草案入口删除（F07）。本基线只冻结执行起点，实施需 target-design 细化并经用户批准（RC-D0）。
