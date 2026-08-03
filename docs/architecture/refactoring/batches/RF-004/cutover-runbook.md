---
id: DOC-ARCH-RF004-CUTOVER
title: RF-004切换手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004切换手册

切换（MCP/Harness 凭据绑定上线）沿用通用门禁：合同冻结、兼容测试全绿、影子等价、身份/18链无回退、回滚演练；生产切流经用户显式批准后执行（复用 RF-001-B4-S4 / RF-002-S5 / RF-003-S3 受管 stop→start 模式）。软回退：`HENGZHUN_RF004_LEGACY_CREDENTIAL=1` 恢复 i3-customer 注入。
