---
id: DOC-ARCH-RF051-ROLLBACK
title: RF-051 rollback runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 rollback runbook

If the additive migration or service replacement fails, preserve all EOD, reconciliation and difference rows and rebuild the prior Bank Channel image. Do not decrement Fineract's business date or delete accounting data.
