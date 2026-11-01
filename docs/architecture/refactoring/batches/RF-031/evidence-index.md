---
id: DOC-ARCH-RF031-EVIDENCE
title: RF-031 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-031 Evidence Index

## Baseline

- RF-030 provides seed and identity evidence only.
- Source inspection identifies correlation/idempotency conflation and optional business-date coupling.
- RF-031 begins without a posted transfer, balance delta, browser result, LIVE_E2E, Full18 or release evidence.

## Closure (2026-09-03)

- Bank Channel Java 21 suite: `51/51`, failures `0`, errors `0`, skipped `0`.
- Customer and Operations contracts require both idempotency and correlation headers; both Money schemas remain strings. v10 contains the three receipt evidence changesets.
- Refactoring and documentation governance pass; `git diff --check` passes with line-ending notices only.
- Failure-recovery activity: after Fineract accepted a transfer and the legacy Channel receipt insert rolled back, v10 migration plus same core idempotency key settled the Channel record without changing either Fineract balance again.
- Formal fresh integration: duplicate create returned the same transfer; duplicate process remained terminal and did not change balances; source decreased and destination increased exactly `100.00 CNY`; combined balance was conserved.
- Channel projection contained exactly one `100.00` debit and one `100.00` credit with the business correlation ID. Customer and Operations reads returned the same settled status, correlation ID and non-empty Fineract core reference.
- Sanitized evidence: `agent/runs/rf031/20260903-160500/integration-result.json`, SHA-256 `06130d97770342757cc7bc8ff2104ff9e9dcab15dc0f15d041ff6a7e586d3146`.
- All ephemeral Keycloak subjects and exact RF-031 containers/volumes were removed. Original project containers remain stopped and original project volumes remain present.

RF-031 S1/S2/S3 and RF-031 are closed. This proves A03-M02 API/INTEGRATION only; portal browser flow, LIVE_E2E, Full18 and release remain unproven.
