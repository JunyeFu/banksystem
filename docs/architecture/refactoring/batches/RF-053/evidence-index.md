---
id: DOC-ARCH-RF053-EVIDENCE
title: RF-053 customer read-model evidence
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-053 customer read-model evidence

## Result

RF-053 is deployed to the retained local demo topology and is in REVIEW/observation. No ReleaseIdentity was frozen and no Full18 or release GO is claimed.

## Verification

| Gate | Result |
|---|---|
| Java 21 | PASS, 77/77; zero failures, errors, or skips |
| Mapper and statement contracts | PASS; signed money preserved, unknown types rejected, account currency supplies omitted transaction currency, deterministic statement balance validated |
| Public error contract | PASS; raw Fineract response body is absent; only status and stable bank error code are public |
| Savings action boundary | PASS; generic command removed; approve, activate, and deposit are explicit actions using a core-owned posting date |
| Beneficiary identity | PASS; server HMAC is deterministic and keyed; repeated creation for one destination returns one beneficiary ID |
| Retained golden path | PASS; correlation `bank-transfer-golden-e4b037bbc13b4c55999e7ee1ece07e86`, Fineract transaction `12`, amount CNY 100.00 |
| Customer Portal | PASS; production build completed and `http://127.0.0.1:18082/portal/` returned 200 with the application root |
| Keepalive | PASS; all 15 Docker containers remain running; only Bank Channel was replaced |

## Boundary

This batch validates the customer read-model and beneficiary contracts against the retained Fineract state. RF-056 still owns removal of controller-to-controller coupling. RF-053 does not freeze a new ReleaseIdentity or establish LIVE_E2E release evidence.
