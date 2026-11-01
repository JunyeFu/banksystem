---
id: DOC-ARCH-RF051-EVIDENCE
title: RF-051 EOD reconciliation evidence
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 EOD reconciliation evidence

## Result

RF-051 implementation is deployed to the retained local demo topology and is in REVIEW/observation. No ReleaseIdentity was frozen and no Full18 or release GO is claimed.

## Verification

| Gate | Result |
|---|---|
| Java 21 | PASS, 66/66; includes three temporary-PostgreSQL EOD integrations for normal completion, difference recovery and interrupted resume, plus exact core amount/currency mismatch |
| API client | PASS, 15/15 after OpenAPI regeneration |
| Operations Console build | PASS; `INTERRUPTED` is rendered as resumable progress |
| Operations Console browser | PASS at `http://127.0.0.1:18083/ops/eod`; OIDC login, page identity, non-blank render, enabled start control and confirmation modal verified with zero console errors; confirmation was not submitted |
| Liquibase v13 retained-state migration | PASS, four changesets; step/difference tables, JSON details, clearing facts and active-business-date index applied |
| Read-only reconciliation | PASS; CHANNEL_TO_CLEARING `08cbc1a1-29d6-4348-a302-6aa74ffc3d0a`, CHANNEL_TO_CORE `c0d9e2e7-818e-493b-8115-6db72d1add95`, CORE_TO_GENERAL_LEDGER `3450a5ff-048a-449c-bb58-f30b6138fbb1`, all zero differences |
| Existing bank golden path | PASS after final regression, correlation `bank-transfer-golden-58354e4823bf44bab2bf63dd7500e2fc`, Fineract transaction `7`, amount CNY 100.00 |
| Architecture and docs gates | PASS |
| Keepalive | PASS; four HTTP health/readiness endpoints return 200 and all 15 containers remain running |

## Boundary

No live EOD date advance is executed against the retained demo state. The isolated PostgreSQL integration proves normal advancement, difference blocking and interrupted resume without repeating completed jobs; the retained runtime proves migration and read-only reconciliation compatibility. A failed EOD remains immutable but no longer prevents a new keyed run for the same business date after its differences are resolved.
