---
id: DOC-ARCH-RF051-CONTRACT
title: RF-051 contract delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 contract delta

- EOD status adds `INTERRUPTED`; the same business-date run resumes from persisted `stepsCompleted`.
- `eod_run_step` is the authoritative completed-step set.
- Reconciliation runs carry EOD run, business date and phase; field differences carry transaction, field, expected and actual values.
- Clearing stores the submitted reference, amount and currency snapshot used for later comparison.
