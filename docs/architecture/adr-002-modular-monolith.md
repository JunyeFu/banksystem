# ADR-002: Modular monolith, not first-phase microservices

Status: ACCEPTED
Date: 2026-07-11
Supersedes: None

## Context

The channel layer needs to implement identity, customer, account, beneficiary, payment, loan application, risk, notification, document, reconciliation, audit, and test-support capabilities. A microservices architecture would introduce network complexity, distributed transaction challenges, and operational overhead for a single-machine local deployment.

## Decision

Adopt a modular monolith architecture for `bank-channel-service`. The service is a single deployable unit with clear module boundaries:

```text
bank-channel-service
├─ identity
├─ customer
├─ account
├─ beneficiary
├─ payment
├─ loan-application
├─ risk
├─ notification
├─ document
├─ reconciliation
├─ audit
├─ test-support
└─ fineract-adapter
```

Only `mock-clearing-service` is independently deployed, because it simulates an external clearing house.

## Consequences

- Modules share a database but have separate Liquibase changelog files.
- Cross-module communication uses in-process method calls, not network calls.
- Module boundaries are enforced by package structure and code review, not by network isolation.
- A future migration to microservices is possible if module boundaries are respected.
- The Fineract Adapter module is the single point of egress to core.

## Alternatives considered

- **Microservices from day one**: Rejected. Over-engineered for a single-machine local deployment; introduces distributed transaction complexity for money operations.
- **Single flat module**: Rejected. No clear ownership boundaries; makes parallel Agent work and future extraction difficult.
