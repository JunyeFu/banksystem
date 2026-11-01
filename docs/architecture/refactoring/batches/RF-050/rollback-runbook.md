---
id: DOC-ARCH-RF050-ROLLBACK
title: RF-050 rollback runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-050 rollback runbook

If deployment fails, keep the database and all unaffected containers running, correct the additive migration, rebuild Bank Channel, and repeat health checks. Do not delete transfer, reversal, idempotency, risk, or Fineract data. A core-result-unknown reversal remains readback-only under its original key.
