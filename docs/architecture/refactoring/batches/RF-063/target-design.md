---
id: RF063-TARGET-DESIGN-MD
title: RF063 target-design.md
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-02
owner: Codex
---

# 修复目标

根据 2026-09-30 建模 M01—M17 和 2026-10-02 源码复核修复业务语义、分布式失败、模块归属和产品验收缺口。Fineract 唯一银行真相源；Harness SQLite 唯一执行状态源。五切片串行，各片最多同时打开两个直接相关模块。

