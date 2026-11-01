---
id: RF063-CUTOVER-RUNBOOK-MD
title: RF063 cutover-runbook.md
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-02
owner: Codex
---

# 定向替换

先通过离线门，再仅构建并替换实际受影响服务；保留Docker其他服务及卷。禁止down/reset，禁止推进留存环境Fineract日期做测试。模型和银行凭据只由现有消费入口使用，不进入报告。

