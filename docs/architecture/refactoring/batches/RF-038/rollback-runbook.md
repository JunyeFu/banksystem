---
id: DOC-ARCH-RF038-ROLLBACK
title: RF-038 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-038 Rollback

Stop Harness, restore the RF-037 frontend and server source set, rebuild Harness, and confirm `/quality/` is absent while `/api/quality/v1` remains available. No SQLite restore is required.
