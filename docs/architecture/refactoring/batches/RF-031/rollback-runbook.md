---
id: DOC-ARCH-RF031-ROLLBACK
title: RF-031 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-031 Rollback

Stop the active RF-031 campaign, preserve the first-failure result, delete only RF-031-labelled ephemeral resources, and revert only RF-031-owned source, contract, test and governance paths. Never reverse a Fineract transaction by database mutation; an accepted business reversal must use its formal API in a separately authorized batch.
