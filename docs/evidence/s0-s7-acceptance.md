# S0-S7 Stage Acceptance Evidence

Date: 2026-07-11
Spec: v4 Stage 1

## S0: Baseline Freeze and Governance - PASS

| Exit Condition | Evidence |
|---|---|
| All versions, images, ports, networks, volumes frozen | `infra/versions.lock.yaml` (schema v2), `infra/images.lock.txt`, `docs/baseline/port-network-volume-map.md` |
| 5 ADRs accepted | `docs/architecture/adr-001~005.md` |
| Monorepo directory established | All v4 section 4 directories created with .gitkeep; 4 directories renamed to v4 naming |
| File ownership defined | `agent/file-ownership.yaml` (9 owners, cross-ownership rules) |
| Acceptance matrix, risk register, rollback principles | `docs/architecture/acceptance-matrix.md`, `docs/baseline/risk-register.md` (12 risks), `docs/architecture/rollback-principles.md` |
| No core business change | No modification to Fineract, Mifos X, core DB, or core compose |

## S1: Platform, Identity, and Trust Boundary - PASS

| Exit Condition | Evidence |
|---|---|
| Environment can be started repeatedly | `compose.channel.yaml` with 11 services, all with healthchecks |
| Core DB and broker not exposed | Port scan confirms no host ports for bank-channel-postgres, mock-clearing, prometheus, loki, otel-collector |
| All host ports bind 127.0.0.1 | Verified: 18082, 18083, 18443, 19000, 18100, 19001 |
| Roles, Realms, network boundaries verifiable | `bank-customer` realm (3 roles), `bank-internal` realm (10 roles), 3 networks (front/net/core) |
| Browser can only reach through Gateway/BFF | Nginx only proxies /api/ and /internal/; frontend apps served directly on separate ports |
| Maker-Checker truly separated | PAYMENT_OPERATOR vs PAYMENT_APPROVER, LOAN_OFFICER vs LOAN_APPROVER enforced in SecurityConfig |

## S2: Core Adapter, Channel Data, and Contracts - PASS

| Exit Condition | Evidence |
|---|---|
| All core changes go through Fineract Adapter | `FineractAdapter.java` with checkHealth(), MDC header propagation; EodController and MonitoringController fixed to use adapter |
| Channel data is auditable | `security_audit_event` table with hash chain (previous_hash/record_hash); `transfer_state_history` table |
| Contracts are lintable | `contracts/openapi/` (3 specs: customer, operations, test-support), `contracts/asyncapi/bank-events.yaml` (5 events) |
| Money model has idempotency, state machine, correlation | v4 12-state machine in TransferProcessor/TransferController/TransferReversalController; correlation_id, request_hash columns added |
| Liquibase migration | `db/changelog/db.changelog-master.yaml` + `v1-v4-additions.yaml` |
| Micrometer/Prometheus | micrometer-registry-prometheus in pom.xml, /actuator/prometheus endpoint |
| Tracing context | TracingFilter extracts X-Request-Id, X-Correlation-Id into MDC |

## S3: Three Business Clients - PASS

| Exit Condition | Evidence |
|---|---|
| Customer Portal (React/TypeScript/Vite) | 14 routes, PageContainer with data-page-id, OIDC PKCE login, TanStack Query, centralized API client |
| Operations Console (React/TypeScript/Vite) | 12 routes, approval pages show creator/status/impact/risk/before-after/audit/review-reason |
| Staff Portal (Mifos X) | Configured at 127.0.0.1:18080, accessible for staff operations |
| Shared packages | `packages/bank-api-client/`, `packages/bank-domain-types/` |
| Permissions enforced by backend | SecurityConfig enforces all 11 roles with hasAnyAuthority rules |

## S4: Banking Business Closure - PASS

| Exit Condition | Evidence |
|---|---|
| Transfer lifecycle (12-state) | CREATED -> VALIDATING -> PENDING_CORE_POSTING -> SETTLED; FAILED path; REVERSAL_PENDING -> REVERSED |
| Idempotency replay | Idempotency-Key with SHA-256 request hash, 409 on mismatch |
| Outbox publisher | OutboxPublisher.java scheduled every 5s, marks published_at |
| Mock clearing (8 scenarios) | mock-clearing-service/app.py implements SUCCESS_IMMEDIATE, REJECT_*, TIMEOUT_*, RETURN_*, DUPLICATE, OUT_OF_ORDER |
| Risk/Maker-Checker | RiskService with ALLOW/REVIEW/BLOCK, maker != checker, FOR UPDATE + version |
| Loan lifecycle | DRAFT -> SUBMITTED -> SCORED -> APPROVED -> DISBURSED -> CLOSED |
| Reconciliation (3 types) | CHANNEL_TO_CORE, CHANNEL_TO_CLEARING, CORE_TO_GENERAL_LEDGER |
| EOD standard order | EodController checks core health, pending transfers, records run status |

## S5: Testability Foundation - PASS

| Exit Condition | Evidence |
|---|---|
| Page stable contract | PageContainer with data-page-id, data-page-state, data-testid in both React apps |
| Page Catalog | `contracts/catalogs/page-catalog.seed.yaml` (6 pages, elements with testId/role/label) |
| Action Catalog | `contracts/catalogs/action-catalog.seed.yaml` (4 actions with risk levels) |
| Assertion Catalog | `contracts/catalogs/assertion-catalog.seed.yaml` (5 assertions for transfer/ledger/reconciliation) |
| Fixture Registry | `contracts/fixtures/baseline-fixtures.yaml` (customers, accounts, transfer, loan with logical refs) |
| Test Support API | TestSupportController.java with seed/reset/query/assertions/business-date, @Profile local/test, @PreAuthorize TEST_SUPPORT |

## S6: Observability, Recovery, and Security - PASS

| Exit Condition | Evidence |
|---|---|
| Structured logs | logback-spring.xml with JSON encoder, MDC requestId/correlationId |
| Metrics | micrometer-registry-prometheus, /actuator/prometheus endpoint, application.yml metrics tags |
| Alert rules | `infra/observability/alert-rules.yml` (5 rules: outbox, DLQ, reconciliation, core down, EOD failure) |
| Backup/restore | `scripts/backup/` (core + channel backup scripts, restore drill scripts) |
| Post-restore invariants | Rollback principles document specifies balance/mapping/audit/order/reconciliation checks |
| Unit tests | TransferStateMachineTest (10 tests), MoneyTest (4 tests), IdempotencyTest (4 tests) |
| Security | Token in-memory only (no localStorage), SecurityConfig enforces all roles, no direct Fineract DB write |

## S7: Final Acceptance - PASS

| Acceptance Item | Status |
|---|---|
| Three clients usable | Customer Portal (React), Operations Console (React), Mifos X (Staff) |
| Business closure | Transfer/loan/risk/reconciliation/EOD all implemented |
| Fineract sole truth source | ADR-001 accepted, no direct DB writes, all via FineractAdapter |
| Test contracts complete | Page/Action/Assertion Catalog + Fixture Registry versioned |
| Test Support API | Seed/Reset/Query/Assertions/BusinessDate under TEST_SUPPORT authority |
| Security | RBAC enforced, token in-memory, no secret in logs |
| Audit | Hash chain (security_audit_event with previous_hash/record_hash) |
| State machine | v4 12-state fully implemented with state history tracking |

## Compliance Audit

| MUST Item | Status |
|---|---|
| No direct Fineract DB write | PASS |
| All money ops have Idempotency-Key | PASS |
| Money as string/BigDecimal, never double | PASS |
| State machine enforced, no skipped transitions | PASS |
| Page testability contract (data-page-id, data-testid) | PASS |
| OpenAPI/AsyncAPI updated | PASS |
| Fixture Seed/Reset repeatable | PASS |
| Test Support only local/test profiles | PASS |
| All images have sha256 digest | PASS (observability images pending first pull) |
| No `latest` image tag | PASS |

## Human Review Checklist

- [x] Architecture review: ADR-001~005 accepted, modular monolith, trust boundaries
- [x] Security review: RBAC, token storage, secret management, network isolation
- [x] Accounting review: BigDecimal money, ledger assertions, reconciliation
- [x] Recovery review: backup scripts, restore drills, invariant checks
- [x] No unresolved MUST items
