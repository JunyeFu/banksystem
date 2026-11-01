---
id: DOC-ARCH-RF051-BASELINE
title: RF-051 baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 baseline

RF-050 is in REVIEW. EOD previously wrote its idempotency key after all external jobs, held a local transaction across Fineract calls, stored no step checkpoints, and could repeat an already successful job after interruption. Reconciliation counted aggregate symptoms rather than comparing each transaction's reference, amount and currency.
