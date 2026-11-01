---
id: RF065-CUTOVER-RUNBOOK
title: 启用方法
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-09
owner: Codex
---

# 启用方法

仅修改CI及任务专用脚本，不替换原服务。每片先本地验证再登记证据，远端状态保持未验证直到真实运行。全产品源码与构建修改结束后统一身份冻结；本批不能提前执行BYOK或公开发布。

