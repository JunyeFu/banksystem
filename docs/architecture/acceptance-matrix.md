# Stage acceptance matrix

> Banking-core acceptance remains S0-S7 and is not replaced by v5.4. The combined external-demo product adds a separate v5.4 platform acceptance track; target capabilities must be marked planned, PoC, or `PENDING_ENTERPRISE_VALIDATION` until evidence exists.

Scope: v4 banking-core S0-S7; v5.4 platform acceptance is tracked separately.
Each stage has exit conditions and evidence requirements. A stage is not complete until all exit conditions are met and evidence is archived.

## S0: Baseline freeze and governance

| Exit condition | Evidence |
|---|---|
| All versions, images, ports, networks, volumes are frozen | `infra/versions.lock.yaml`, `infra/images.lock.txt`, `docs/baseline/port-network-volume-map.md` |
| 5 ADRs are versioned and accepted | `docs/architecture/adr-001~005.md` |
| Monorepo directory structure established per v4 section 4 | Directory tree with `.gitkeep` |
| File ownership and Agent task boundaries defined | `agent/file-ownership.yaml` |
| Stage-level acceptance matrix, risk register, rollback principles defined | This file, `docs/baseline/risk-register.md`, `docs/architecture/rollback-principles.md` |
| No core business change | No modification to Fineract, Mifos X, core DB, or core compose |

## S1: Local platform, identity, and trust boundary

| Exit condition | Evidence |
|---|---|
| Environment can be started repeatedly | `docker compose up` succeeds from clean state |
| Core DB and broker not exposed | Port scan confirms no host ports for channel-db, ActiveMQ, Mock Clearing |
| Roles, Realms, network boundaries verifiable | Keycloak realm export, RBAC matrix, network diagram |
| All host ports bound to 127.0.0.1 | Port scan |
| Browser can only reach bank services through Gateway/BFF | Direct access to Fineract/DB/Broker returns connection refused |
| Maker-Checker is truly separated | Two-person approval integration test |

## S2: Core adapter, channel data, and versioned contracts

| Exit condition | Evidence |
|---|---|
| All core changes go through Fineract Adapter | Code review confirms no direct Fineract URL construction outside adapter |
| Channel data is auditable | Audit chain hash verification test passes |
| Contracts are lintable | OpenAPI/AsyncAPI lint in CI |
| Money model has idempotency, state machine, correlation tracking | Unit tests for state machine, idempotency, and correlation |
| No Controller directly calls Repository or Fineract | Architecture review confirms layered pattern |
| No double money type, no unversioned migration | Code search and Liquibase verification |

## S3: Three business clients

| Exit condition | Evidence |
|---|---|
| Customer Portal stable and accessible | Manual walk-through of all 14 routes |
| Operations Console stable and accessible | Manual walk-through of all 12 routes |
| Mifos X (Staff Portal) configured and accessible | Staff operations manual verification |
| Main business flows can be completed manually | End-to-end manual test record |
| Permissions enforced by backend | API returns 401/403 without proper role |
| Frontend does not store token in localStorage | Code review |
| Frontend does not directly call Fineract | Network inspection confirms all API calls go through Gateway |

## S4: Banking business closure

| Exit condition | Evidence |
|---|---|
| Customer/account/transfer/loan/accounting/EOD closure | E2E scripts pass |
| Every money operation has idempotency, state history, core transaction, accounting, outbox, notification, audit, reconciliation evidence | Assertion API results |
| REVIEW/return/reversal/timeout do not double-post or overwrite | Money invariant test results |
| EOD failure does not advance business date | EOD failure test |
| Loan has complete lifecycle (apply -> score -> approve -> disburse -> repay -> overdue -> close) | Loan E2E |
| Accounting balance check passes | Debit == Credit assertion |

## S5: Testability foundation

| Exit condition | Evidence |
|---|---|
| Pages have stable locators (data-page-id, data-testid, role, label) | Page Catalog verification |
| Scripts do not guess database IDs | Fixture Registry uses logical refs; runtime IDs from Seed API |
| Test context can independently Seed, execute, read assertions, Reset | Test Support API test |
| Test Support does not leak secrets, bypass permissions, or write to Fineract DB | Security review of test-support module |
| Catalog matches real routes, DOM, and API | Catalog-to-runtime comparison test |

## S6: Observability, recovery, and security quality gates

| Exit condition | Evidence |
|---|---|
| Failures are discoverable | Alert verification for outbox backlog, DLQ, reconciliation difference, core dependency failure, EOD failure |
| Recovery is verifiable | Restore drill with invariant checks (balance, mapping, audit, order, reconciliation) |
| Critical quality gates have repeatable evidence | Unit/contract/integration/accessibility/permission/money/accounting/reconciliation/recovery test results |
| No uncovered permission boundary, money concurrency, callback signature, log masking, or dependency vulnerability | Security review report |

## S7: Final acceptance and human review

| Exit condition | Evidence |
|---|---|
| Three clients all usable | Manual verification record |
| Customer/account/transfer/loan/accounting/EOD closure | Full regression report |
| Fineract is sole truth source | ADR-001 compliance audit |
| Page/Action/Fixture Catalog and Assertion API complete | Catalog verification |
| Fixture Seed/Reset repeatable | 3 consecutive Seed/Reset cycles pass |
| Security/audit/accounting/recovery/money E2E/accounting balance all pass | Evidence archive |
| Human review passed | Sign-off in `docs/evidence/` |
| No unresolved MUST items | Compliance audit |
