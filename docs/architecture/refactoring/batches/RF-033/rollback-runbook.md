---
id: DOC-ARCH-RF033-ROLLBACK
title: RF-033 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-033 Rollback

Stop the browser campaign at its first deterministic failure, preserve the failure evidence, delete only RF-033-labelled resources, and revert only RF-033-owned portal paths. Never compensate a Fineract posting through a database write.
