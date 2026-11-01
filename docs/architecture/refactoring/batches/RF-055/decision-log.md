---
id: DOC-ARCH-RF055-DECISIONS
title: RF-055 decision log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-055 decision log

- 2026-09-23: user approved the three-slice RF-055 refinement chain.
- 2026-09-23: one canonical fixture catalog, one lifecycle application service and one dedicated Test Support runtime were selected; no generic extension framework is introduced.
- 2026-09-23: default Compose must omit Mock Clearing while retaining it as an explicit opt-in test profile.
- 2026-09-23: S1 code archaeology found `fixtures:reset` deletes all Channel business tables although retained history exists. Reset is narrowed to fixture-owned mappings; two-cycle verification must never erase settled money or audit history. The contract's required namespace/run headers have no implementation or callers, so RF-055 records the mismatch and does not claim namespace isolation.
- 2026-09-23: S1 live verification found the retained `bank-internal` realm has only built-in clients; the declared `bank-channel-service` client is absent. The fixture verifier now idempotently restores that project client and its TEST_SUPPORT service-account role before obtaining a token. S2 will own the permanent fixed user provisioning.
- 2026-09-23: the first two-cycle run reached the business-history assertion. Fixture operations correctly append audit events, so audit row equality was an invalid verifier expectation; the check now requires unchanged transfer count and nondecreasing audit count, while the PostgreSQL integration test verifies reset leaves both tables untouched.
- 2026-09-23: S1 passed Java 21, RF-055 governance, OpenAPI parse and two live reset/seed cycles. S1 is complete; S2 may begin. The clean-clone first-create path is reserved for the final fresh-start gate.
- 2026-09-23: S2 resolved the prepare/up ordering conflict. `prepare` creates durable local credential material; `up` creates Keycloak users and binds the customer after the services exist. This preserves the existing command meanings.
- 2026-09-23: retained `prepare` failed because `npm ci` attempted to unlink a native module loaded by the running Agent (`EPERM`). Incremental `npm install` repaired the partial dependency tree without stopping services. `prepare` now uses `ci` on a fresh checkout and `install` when dependencies already exist; the local credential material is written before dependency work.
- 2026-09-23: the next retained `prepare` reached browser runtime installation and encountered the same occupied-dependency pattern. The browser-runtime installer now makes the same fresh-vs-existing choice.
- 2026-09-23: S2 passed retained `prepare`, two stable Keycloak provisioning calls, both real browser login flows and post-recreate persistence. S2 is complete; S3 may begin.
- 2026-09-23: S3 uses a dedicated `test-support` Spring profile and Compose service; the main service defaults to `demo`, while the `mock-clearing` profile is explicit opt-in. Gateway only forwards Test Support paths to the dedicated service. `demo.ps1` was added to S3 paths because its declared healthy-service set must reflect the new topology; the fixture verifier was also included after its observed PowerShell 5.1 default-argument failure.
- 2026-09-23: The obsolete Mock Clearing container was stopped after cutover; it and its volumes were not deleted. Other bank containers remain running. Full `demo.ps1 up` reached Agent start and returned `AGENT_LIVE_NOT_AUTHORIZED` because RF-055 edits invalidate the old identity. RF-055 does not mutate LIVE authorization or claim Full18.
