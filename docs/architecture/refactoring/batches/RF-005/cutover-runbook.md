---
id: DOC-ARCH-RF005-CUTOVER
title: RF-005切换手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005切换手册

切换（case_prepare 单路由上线）沿用通用门禁：合同冻结、兼容测试全绿（v7 零调用证据）、身份/18链无回退、回滚演练；生产切流经用户显式批准后执行（复用受管 stop→start 模式）。
