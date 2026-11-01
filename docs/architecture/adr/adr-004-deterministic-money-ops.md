---
id: DOC-279B7FD523
title: ADR-004: All money write operations must have deterministic control
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# ADR-004: All money write operations must have deterministic control

Status: ACCEPTED
Date: 2026-07-11
Supersedes: None

## Context

Money write operations (transfers, loan disbursements, repayments, fee postings, reversals) carry financial risk. Without deterministic controls, concurrent requests, network retries, or partial failures could cause duplicate postings, lost updates, or inconsistent accounting.

## Decision

Every money write operation MUST include all of the following controls:

1. **Idempotency-Key**: A unique key per logical operation. Same key + same request = same response. Same key + different request = 409 Conflict.
2. **Correlation ID**: Propagated end-to-end (Gateway -> Service -> Adapter -> Fineract) for tracing and reconciliation.
3. **State machine**: A finite state machine governs allowed transitions. No transition may be skipped or reversed.
4. **Optimistic lock**: A `version` column prevents concurrent updates. Stale writes are rejected.
5. **Outbox**: State changes and outbox events commit atomically in the same database transaction. The outbox is published asynchronously.
6. **Audit**: Before/after state, actor, action, and hash chain are recorded for every money operation.
7. **Accounting projection**: The channel may project debit/credit views for test and UI use, but Fineract remains the only ledger and a transfer is successful only after authoritative Fineract readback.
8. **Reconciliation**: Channel-to-core and channel-to-clearing reconciliation must detect divergence.
9. **Failure compensation**: Failed operations move through defined states (e.g., REVERSAL_PENDING -> REVERSED), never by overwriting original records.
10. **Replay evidence**: Operations can be replayed from outbox and audit logs to reconstruct state.
11. **Transaction boundary**: No Fineract network call runs inside a channel database transaction. The channel commits the submission boundary first, calls Fineract, then converges local state in a new transaction.
12. **Unknown core result**: A timeout, response loss, 5xx response, missing core reference, or failed readback moves the transfer to `CORE_RESULT_UNKNOWN`; it is never treated as a rejection and never causes an automatic second debit.
13. **Authoritative readback**: Before `SETTLED` or `FAILED`, the processor reads Fineract using the same channel idempotency key embedded in the unique transfer description. `FAILED` is allowed only after an explicit 4xx rejection and an empty readback.

## Consequences

- Money POST endpoints require `Idempotency-Key` header; absence returns 400.
- Fund transfers use `BigDecimal` / `NUMERIC(19,2)`, never `double` or JSON number.
- Money operations do not unconditionally auto-retry on failure.
- Re-entering a submitted transfer performs readback only; it does not repeat the Fineract POST.
- Credentials and raw errors from Fineract are never returned to the browser.
- The transfer state machine includes `PENDING_CLEARING -> CORE_RESULT_UNKNOWN -> SETTLED|FAILED` for ambiguous remote outcomes.

## Alternatives considered

- **Pessimistic locking**: Rejected for channel-level operations. Channel reservation alone cannot prevent concurrent core-side debits (R-008). Compensation and reconciliation are the safety net.
- **Saga with distributed transactions**: Rejected. Single database (channel) + API-based core integration makes sagas unnecessary in this phase.
