# Agent execution rules

`agent/backlog.yaml` is the authoritative scheduler for stages S0-S7. Claim exactly one READY task, honour all dependencies and allowed paths, and move completed work only to REVIEW.

## Stage progression

```
S0 Baseline & Governance
  -> S1 Platform, Identity & Trust
  -> S2 Core Adapter, Channel Data & Contracts
  -> S3 Three Business Clients (Customer Portal | Operations Console parallel)
  -> S4 Banking Business Closure (after S2, joint test with S3)
  -> S5 Testability Foundation (after real pages and real APIs exist)
  -> S6 Observability, Recovery & Security
  -> S7 Final Acceptance
```

## File ownership

`agent/file-ownership.yaml` defines who owns what. Cross-ownership modifications MUST be documented in `agent/reports/`.

## Core protection

The Fineract databases `fineract_default` and `fineract_tenants` are core-owned. Do not write to them directly. Use the Fineract API for all business changes.

## Security

- Never report secrets, tokens, full account identifiers, identity documents, or database passwords.
- Browser clients MUST NOT directly call Fineract.
- No image may use the `latest` tag.
- All money write operations require Idempotency-Key, Correlation ID, state machine, optimistic lock, outbox, audit, accounting assertion, and reconciliation.

## Quality gates

Every task must pass: contract lint, unit tests, integration tests, E2E for money changes, reconciliation assertion, and security review before moving to DONE.

## Review chain

```
Developer Agent
  -> Contract Lint
  -> Build
  -> Unit
  -> Integration
  -> Accessibility/Testability Review
  -> Financial E2E
  -> Accounting/Reconciliation Review
  -> Security Reviewer
  -> Human Reviewer
  -> Merge
```

## Rollback

See `docs/architecture/rollback-principles.md`. Key rules:
- A failed stage does not advance.
- EOD failure does not advance business date.
- Money failures go through state machine, never overwrite.
- Post-restore must verify invariants (balance, mapping, audit, order, reconciliation).
