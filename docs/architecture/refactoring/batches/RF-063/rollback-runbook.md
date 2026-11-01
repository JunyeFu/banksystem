---
id: RF063-ROLLBACK-RUNBOOK-MD
title: RF063 rollback-runbook.md
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-02
owner: Codex
---

# 恢复

遇到重复记账、金额不守恒或凭据泄露停止本批驱动。保留核心事实及历史，结果未知只回读。恢复仅限本批文件局部变更及本批替换服务，保留用户原始脏修改；不自动数据库回滚或删卷。

