# Risk register

Spec: v4 stage 1.
Frozen: 2026-07-11 as part of S0 baseline governance.

## Active risks

| ID | Severity | Finding | Required treatment | Stage |
|---|---|---|---|---|
| R-001 | High | Fineract is `1.15.0-SNAPSHOT`; plugin compatibility is not established. | Default to an independent Customer BFF; require ADR and full regression before any Self Service Plugin decision. | S2 |
| R-002 | High | Core money-operation idempotency header is not declared in the local OpenAPI. | Use a channel-level `Idempotency-Key`, state machine, outbox/inbox and integration proof before money operations. | S2 |
| R-003 | High | External event configuration has 131 rows but 0 enabled. | Do not depend on core event delivery; use isolated channel events unless separately approved. | S2 |
| R-004 | Medium | ActiveMQ image previously retained a `latest` tag. | S0 has pinned version `6.1.2` with digest. Verify runtime matches in S1. | S1 |
| R-005 | Medium | Fineract and Mifos images use development tags paired with digests. | Treat observed digests as baseline; prohibit automatic image upgrades. Upgrade requires ADR + full regression. | S0 |
| R-006 | Medium | Docker Desktop depends on a manually configured machine proxy. | Keep address redacted; harden proxy exposure in a separate workstation task, not during channel work. | Ongoing |
| R-007 | Medium | Fineract has no Docker health check. | Use actuator health in integration and monitoring tests. S1 may add Docker healthcheck to core compose if approved. | S1 |
| R-008 | High | A channel reservation cannot prevent concurrent core-side debits by itself. | Design compensation, idempotency and reconciliation before payments; consider core freezing only after explicit approval. | S4 |
| R-009 | Medium | Current runtime ports (Gateway 18081, Keycloak 18082) differ from v4 targets (18443, 19000). | S0 documents v4 target ports; S1 migrates compose and Keycloak realm redirects. | S1 |
| R-010 | Medium | Current frontend apps are plain HTML/JS, not React/TypeScript per v4 spec. | S3 will rebuild Customer Portal and Operations Console using React/TypeScript/Vite per v4 section 5.1 and 13. | S3 |
| R-011 | Low | Keycloak internal realm is missing CUSTOMER_SERVICE and RISK_ANALYST roles from v4 section 12. | S1 will add all 11 v4 roles to bank-internal realm. | S1 |
| R-012 | Medium | No packages/ directory existed for shared TypeScript packages before S0. | S0 created directory skeleton; S3 populates bank-api-client, bank-ui-kit, bank-domain-types, bank-test-contracts, security-utils. | S3 |

## Risk rules

- Risks are reviewed at each stage exit.
- New risks discovered during a stage MUST be registered before stage exit.
- High-severity risks MUST have a treatment plan before the dependent stage begins.
- Closed risks are moved to a "Resolved" section with resolution evidence.
