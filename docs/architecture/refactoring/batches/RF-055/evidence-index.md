---
id: DOC-ARCH-RF055-EVIDENCE
title: RF-055 evidence index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-055 evidence index

Status: S1, S2 and S3 verified; RF-055 batch is OBSERVING and its backlog item is in REVIEW. Current source requires a new Agent LIVE authorization, so this is not Full18 or release GO.

| Gate | Result |
|---|---|
| RF-055 governance | `py -3 scripts/architecture/validate_refactoring.py --batch RF-055` exited 0, `REFACTOR_VALIDATION=PASS batches=1 modules=27` |
| Contract syntax | Test Support OpenAPI parsed successfully with PyYAML |
| Java 21 | Maven `test` exited 0 in the non-root Java 21 container; the suite includes PostgreSQL reset preservation |
| Retained runtime | Channel image rebuilt and only the Channel service recreated; it returned healthy |
| Fixture lifecycle | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/demo/verify-fixture-lifecycle.ps1` exited 0, `RF055_FIXTURE_LIFECYCLE=PASS cycles=2 loanProductId=1 aliceClientId=1 businessHistory=UNCHANGED` |
| Fineract product uniqueness | Direct API listed exactly one `Hengzhun Demo Loan` and one `BankSystem Demo Savings` |
| S1 managed services | At the S1 gate, 15 containers remained running; no project service had been stopped |
| Prepare | `pwsh -NoProfile -ExecutionPolicy Bypass -File demo.ps1 prepare` exited 0; local `.env` has all four fixed identity keys; output returned a provisional generated identity that is invalidated by subsequent edits |
| Identity idempotency | Two calls of `provision-fixed-demo-identities.ps1` returned the same customer ID `fc41a977-988e-4a92-a109-4fcf118de7c9`, operator ID `efd1cb5c-0eef-4e57-8f45-aa64a77ca75d`, and Fineract client ID `1` |
| Two browser logins | `verify-fixed-demo-identities.ps1` exited 0: `RF055_FIXED_DEMO_IDENTITIES=PASS customerAccounts=1 operationsDashboard=READY` |
| Restart persistence | Bank Channel recreated with Compose, returned healthy, and the same Playwright check passed again |
| Runtime topology | Default `docker compose ... config --services` includes `test-support-service` and excludes `mock-clearing-service`; main, Test Support and Gateway are healthy after targeted replacement |
| Formal route isolation | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo/verify-test-support-isolation.ps1` exited 0: `RF055_TEST_SUPPORT_ISOLATION=PASS main=404 dedicated=SEEDED clientId=1 mockDefault=ABSENT` |
| Post-cutover regression | Java 21 Maven `test` exited 0; PowerShell 5.1 two-cycle fixture verifier and Playwright two-portal login both exited 0 after the dedicated listener cutover; login was rerun after fixture reset/seed |
| Retained runtime | Core bank and channel product containers remain running; only the retired `mock-clearing-service` container was stopped, with no deletion or volume reset |
| Full demo command | `demo.ps1 up` reached Agent start and returned `DEMO_AGENT_START_FAILED`; direct lifecycle returned `AGENT_LIVE_NOT_AUTHORIZED`. `demo.ps1 status` reported `bank.ready=true`, Agent `STALE_SOURCE` and overall `NOT_READY`. LIVE authorization was not changed |

Full-repository governance and docs validation currently report only pre-existing RF-054 batch metadata errors (`maxOpenModules=3`, `publicContracts` instead of `publicContract`, and unknown module alias). RF-055 single-batch validation passes. The RF-054 metadata correction needs its own scope; it is not RF-055 S1.
