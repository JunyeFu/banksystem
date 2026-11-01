---
id: DOC-ARCH-RF047-ROLLBACK-RUNBOOK
title: RF-047 rollback-runbook
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-08
owner: Codex
---
# RF-047 rollback-runbook

Restore only RF-047 source edits from the task baseline if needed; preserve unrelated dirty changes. Never reset Docker volumes, directly edit Harness SQLite, delete credentials or rewrite historical evidence. A repaired runtime attempt requires a fresh identity.

