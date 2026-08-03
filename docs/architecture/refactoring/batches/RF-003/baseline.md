---
id: DOC-ARCH-RF003-BASELINE
title: RF-003执行基线冻结记录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003执行基线冻结记录

- 仓库HEAD：`ba41e20`（feat(rf002): S5 production cutover, observation and batch close）
- 分支：`RF-003`（自 `RF-002` 创建；RF-002 已 CLOSED 并推送 `github/RF-002`）
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`（RF-002 后不变）
- Flowise：v7，回读（2026-08-03 S5）`deployed=true`，sourceFlowSha256=`65bc36cd…`、deployedFlowDataSha256=`ae3f51ac…`、chatbotConfigHash=`706f5398…` 与基线一致
- Harness 迁移：`36/36`；18 链账本：`18/18`；MCP 公开面：33 工具、8 字段规范信封、terminal/verificationGate 状态契约（RF-002 产出）
- 版本三源现状（RF003 变化轴，F09）：MCP SDK `8.0.0`（server.cjs L346）、健康接口 `10.0.0`（L1140）、运行时合同 `10.1.0`（contracts/mcp/hengzhun-i8.json）
- 工作区：提交 `ba41e20` 后干净
- 运行身份：正式环境四服务运行中（RF-002 S5 切流后状态），生产 MCP 影子关闭

## RF-003 范围

v54 L1 全景 RF-003（CANDIDATE→解禁 2026-08-03）：统一版本来源（F09）。本基线只冻结执行起点，实施需 target-design 细化并经用户批准（RC-D0）。
