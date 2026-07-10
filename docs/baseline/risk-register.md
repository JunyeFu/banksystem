# Phase 0 risk register

| ID | Severity | Finding | Required treatment |
|---|---|---|---|
| R-001 | High | Fineract is `1.15.0-SNAPSHOT`; plugin compatibility is not established. | Default to an independent Customer BFF; require ADR and full regression before any Self Service Plugin decision. |
| R-002 | High | Core money-operation idempotency header is not declared in the local OpenAPI. | Use a channel `Idempotency-Key`, state machine, outbox/inbox and integration proof before money operations. |
| R-003 | High | External event configuration has 131 rows but 0 enabled. | Do not depend on core event delivery; use isolated channel events unless separately approved. |
| R-004 | Medium | ActiveMQ image reference retains a `latest` tag, although its digest is immutable. | Pin a fixed version tag only after Phase 0 and under an approved core-change procedure. |
| R-005 | Medium | Fineract and Mifos images use development tags paired with digests. | Treat observed digests as baseline; prohibit automatic image upgrades. |
| R-006 | Medium | Docker Desktop depends on a manually configured machine proxy. | Keep address redacted; harden proxy exposure in a separate workstation task, not during core baseline. |
| R-007 | Medium | Fineract has no Docker health check. | Use actuator health in integration and monitoring tests. |
| R-008 | High | A channel reservation cannot prevent concurrent core-side debits by itself. | Design compensation, idempotency and reconciliation before payments; consider core freezing only after explicit approval. |
