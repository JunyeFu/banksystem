---
id: DOC-ARCHITECTURE-STATE-MACHINES.MD
title: State Machines
document_type: reference
domain: banking
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-10
owner: project-owner
---

# Phase 1 state machines

## Transfer

`RECEIVED -> PENDING_REVIEW -> PROCESSING -> POSTED` is the normal path.
Failures may move to `FAILED`; a posted transaction may only move to
`COMPENSATING -> COMPENSATED`. No transition may be skipped or reversed. The
same idempotency key and a different request body is a conflict (`409`).

## Money invariants

- Amounts are decimal strings at the HTTP/event boundary and `BigDecimal` or
  NUMERIC internally; floating-point values are forbidden.
- Every money-changing request requires `Idempotency-Key`.
- A transfer state update and its outbox record must commit atomically in the
  channel database.
- Core mutations are made only through Fineract APIs; reconciliation detects
  divergence and never repairs it by direct database writes.
