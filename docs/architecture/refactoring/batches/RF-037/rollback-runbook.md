---
id: DOC-ARCH-RF037-ROLLBACK
title: RF-037 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-037 Rollback

Stop Harness, restore the RF-036 source set for Harness and the quality contract, rebuild, and confirm `/api/quality/v1` is absent. SQLite requires no rollback because RF-037 adds no migration and performs no data write.
