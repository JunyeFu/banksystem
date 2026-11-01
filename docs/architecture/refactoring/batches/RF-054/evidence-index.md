---
id: DOC-ARCH-RF054-EVIDENCE
title: RF-054 loan workflow evidence
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-054 loan workflow evidence

## Result

RF-054 is deployed to the retained demo topology and is in REVIEW/observation. No ReleaseIdentity was frozen and no Full18 or release GO is claimed.

## Verification

| Gate | Result |
|---|---|
| OpenAPI generation | PASS; customer and operations clients regenerated from the changed contracts |
| API client | PASS, 17/17 |
| Customer Portal | PASS production build; draft then versioned submit uses real returned state and rate |
| Operations Console | PASS production build; loan queue and role-specific actions are present |
| Java 21 | PASS, 75/75; zero failures or errors |
| PostgreSQL state machine | PASS; order, stale version, one pending approval, maker/checker separation, controlled document reference and same-key core replay verified |
| Retained migration | PASS; both v15 change sets and all added columns are present |
| Authenticated live chain | PASS; application `766248b2-f532-4ff7-9c39-79a6edd81437` reached CORE_SUBMITTED and Fineract returned core loan `1`; direct Fineract API readback confirmed client `1`, product `1`, principal CNY 100 and submitted state |
| Browser contract | PASS; Chromium executed draft creation followed by submit with returned version and displayed backend status/rate |
| Frontend live smoke | PASS; portals protected, OIDC ready, Gateway healthy |
| Keepalive | PASS; all 15 Docker containers remain running; only Bank Channel and the two portals were replaced |

## Boundary

The live chain used a synthetic loan product created through the Fineract API. RF-055 must move that product into the single idempotent fixture source. Browser contract evidence proves the production page behavior against its API contract; the authenticated PowerShell chain separately proves the retained runtime and Fineract integration. Neither is Full18 or release evidence.
