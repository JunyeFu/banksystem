---
id: DOC-ARCH-RF003-CUTOVER
title: RF-003切换手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003切换手册

版本统一属 MCP 边界配置变更（SDK 注册名/健康响应版本），不改变工具行为。切换沿用通用门禁：合同冻结、兼容测试全绿、影子等价、身份/18链无回退、回滚演练；生产切流经用户显式批准后执行（复用 RF-001-B4-S4 / RF-002-S5 受管 stop→start 模式）。
