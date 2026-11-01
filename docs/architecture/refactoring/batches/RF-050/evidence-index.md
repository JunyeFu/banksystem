---
id: DOC-ARCH-RF050-EVIDENCE
title: RF-050 transfer rule closure evidence
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-050 transfer rule closure evidence

## Result

RF-050 engineering implementation is deployed to the retained local demo topology and is in REVIEW/observation. No ReleaseIdentity was frozen and no Full18 or release GO is claimed.

## Verification

| Gate | Result |
|---|---|
| Java 21 | PASS, 66/66; includes subject/operation scope, risk stop-before-core, return state path, reversal lost-response replay and checker ownership |
| Customer Portal build | PASS |
| Operations Console build | PASS |
| Contract and migration YAML | PASS |
| Existing-state Liquibase | PASS after removing the deterministic reference to the already-renamed legacy `transfer` table; `v12-*` 3/3 |
| LIVE golden transfer | PASS after final deployment, correlation `bank-transfer-golden-38f5d7a4d18f44659072a1841d6c45af`, Fineract transaction `3`, amount CNY 100.00 |
| Risk/order readback | PASS, `CREATED>VALIDATING>PENDING_APPROVAL>PENDING_CORE_POSTING>PENDING_CLEARING>SETTLED`, risk `ALLOW` before core submission |
| Keepalive | PASS; retained services remain running |

## Boundary

The focused reversal tests prove lost-response re-entry performs one POST and repeated readback, maker cannot self-check, and a second checker cannot take over. A live money-moving reversal was not executed; the golden transfer is the live accounting proof for this batch.
