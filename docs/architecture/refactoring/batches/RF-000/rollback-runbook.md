---
id: DOC-ARCH-RF000-ROLLBACK
title: RF-000回滚手册
document_type: runbook
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# RF-000回滚手册

回滚只针对RF-000白名单中的治理文件。先保存当前差异和校验输出，再撤销重构校验器接入、索引引用和新增治理资产；不得恢复或删除基线中登记的用户既有修改。回滚后重新运行原文档校验并确认业务工作区状态与基线一致。

