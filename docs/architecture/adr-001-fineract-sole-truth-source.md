# ADR-001: Fineract is the sole core accounting truth source

Status: ACCEPTED
Date: 2026-07-11
Supersedes: None

## Context

The local digital banking system is built on top of an existing Fineract + Mifos X core sandbox. Multiple services and clients will be introduced as part of the channel layer. Without a clear truth-source boundary, concurrent writes from channel services and direct database access could corrupt core accounting data.

## Decision

Fineract is the sole core accounting truth source. The following data domains are core-owned:

- Customer core profiles
- Savings accounts
- Loan accounts
- Core transactions
- Accounting entries (journal postings)
- General ledger balances
- Business date

Extension services MUST NOT directly write to the following Fineract databases:

- `fineract_default`
- `fineract_tenants`

Extension systems may only modify core business data through:

1. Fineract REST API (`/fineract-provider/api/v1/*`), or
2. Confirmed official extension interfaces (requires ADR and approval).

## Consequences

- Channel services must use the Fineract Adapter module for all core mutations.
- Reconciliation must detect divergence between channel read models and core state, but must never repair divergence by direct database writes.
- Backup and restore of core data is core-owned; channel backup does not include Fineract databases.
- Any core configuration change (maker-checker, external events) requires ADR, approval, backup, and regression test.

## Alternatives considered

- **Direct database access from channel**: Rejected. Breaks auditability, bypasses Fineract business rules, and risks data corruption.
- **Dual-write to both databases**: Rejected. Creates consistency risks and makes reconciliation meaningless.
