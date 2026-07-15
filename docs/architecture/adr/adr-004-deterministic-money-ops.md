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
7. **Accounting assertion**: Every money operation must produce verifiable accounting entries (debit/credit balance).
8. **Reconciliation**: Channel-to-core and channel-to-clearing reconciliation must detect divergence.
9. **Failure compensation**: Failed operations move through defined states (e.g., REVERSAL_PENDING -> REVERSED), never by overwriting original records.
10. **Replay evidence**: Operations can be replayed from outbox and audit logs to reconstruct state.

## Consequences

- Money POST endpoints require `Idempotency-Key` header; absence returns 400.
- Fund transfers use `BigDecimal` / `NUMERIC(19,2)`, never `double` or JSON number.
- Money operations do not unconditionally auto-retry on failure.
- Credentials and raw errors from Fineract are never returned to the browser.
- The transfer state machine enforces: `CREATED -> VALIDATING -> RISK_REVIEW -> PENDING_APPROVAL -> PENDING_CORE_POSTING -> PENDING_CLEARING -> SETTLED` with defined failure and reversal paths.

## Alternatives considered

- **Pessimistic locking**: Rejected for channel-level operations. Channel reservation alone cannot prevent concurrent core-side debits (R-008). Compensation and reconciliation are the safety net.
- **Saga with distributed transactions**: Rejected. Single database (channel) + API-based core integration makes sagas unnecessary in this phase.
