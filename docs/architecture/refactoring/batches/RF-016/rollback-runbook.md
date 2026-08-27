---
id: DOC-ARCH-RF016-ROLLBACK
title: RF-016 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-016 Rollback Runbook

Revert only RF-016 paths to the recorded dirty baseline. Do not reset the shared tree. No database migration, runtime state, publication or ledger rollback is expected because the batch does not activate runtime.
