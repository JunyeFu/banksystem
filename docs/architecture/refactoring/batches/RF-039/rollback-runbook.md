---
id: DOC-ARCH-RF039-ROLLBACK
title: RF-039 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-039 Rollback

Stop managed services, restore the pre-040 SQLite backup and RF-038 source set, then rebuild. Never edit or drop the new column in place on an active database.
