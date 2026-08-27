---
id: DOC-ARCH-RF006-EVIDENCE
title: RF-006 Evidence Index
document_type: evidence
domain: architecture
status: RECORDED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Evidence Index

Status: `RECORDED` for S1, S2 and S3. RF-006 is closed.

Planned evidence:

- change-classification and reuse-predicate tests;
- duplicate-authoring prevention test;
- adaptive-polling test;
- stage-timing ledger reconciliation;
- focused L1 comparison after RF-007 alignment.

## S1 recorded evidence

- Baseline ledger: `evidence/acceptance-cost-baseline-2026-08-03.json`.
- Baseline analyzer: `platform/hengzhun-regression-system/scripts/i10-acceptance-cost-baseline.cjs`.
- Focused test: `platform/hengzhun-regression-system/tests/i10/acceptance-baseline.test.cjs`.
- Command: bundled Node `--test tests/i10/acceptance-baseline.test.cjs scripts/verification/i10-18-chain-acceptance.test.cjs`.
- Result: exit `0`, 19 tests passed; evidence class `STATIC` plus `CONTRACT`.
- Analyzer command: bundled Node `scripts/i10-acceptance-cost-baseline.cjs`; exit `0`.
- Governance: `REFACTOR_VALIDATION=PASS`, `DOC_VALIDATION=PASS`, `git diff --check` exit `0`.
- Identity before/after: `632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`.
- Accepted ledger records before/after observation: `0/18`; this is not a LIVE acceptance result.
- Concurrent external activity: PID 14332 was running `M3 TEXT_WITH_IMAGE` and changed checkpoints 11 to 12. The count is a point-in-time observation, not a stable S1 output.

No `LIVE_E2E`, publication or runtime readiness label is earned by S1.

## S2 recorded evidence

- Result: `evidence/acceptance-efficiency-s2-2026-08-03.json`.
- Production policy: `platform/hengzhun-regression-system/scripts/i10-acceptance-execution-policy.cjs`.
- Focused test: `platform/hengzhun-regression-system/tests/i10/acceptance-efficiency.test.cjs`.
- Compatibility tests: `tests/i10/acceptance-baseline.test.cjs` and `scripts/verification/i10-18-chain-acceptance.test.cjs`.
- Command: bundled Node syntax checks plus `--test` over the three files above.
- Result: exit `0`, `27/27` tests passed; evidence class `CONTRACT` plus isolated `INTEGRATION`.
- Cost analyzer: bundled Node `scripts/i10-acceptance-cost-baseline.cjs`; exit `0`; B02/B04/B05 resolved and B03 mitigated.
- Identity observation: `632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`; ledger observation `0/18` current records and 18 recoverable checkpoints.

S2 did not restart services, publish Flowise, run a thin LIVE_E2E chain or run the full 18. It earned no runtime acceptance label. The separately approved S3 later supplied the comparative LIVE_E2E evidence below.

## S3 recorded evidence

- Frozen snapshot: `C:\tmp\rf006-s3-before.json`, product root `D:\Agent\banksystem\platform\hengzhun-regression-system`.
- Comparative evidence: `evidence/acceptance-mode-comparison-s3-2026-08-04.json`.
- Command: bundled Node `scripts/i10-acceptance-cost-baseline.cjs compare --output ../../docs/architecture/refactoring/batches/RF-006/evidence/acceptance-mode-comparison-s3-2026-08-04.json`.
- Result: exit `0`, `LIVE_E2E_COMPARATIVE`, cutover decision `ENABLE_SELECTIVE`.
- Legacy: `85,825 ms`, 13 observed gates/polls; selective: `62,870 ms`, 15 observed gates/polls; wall-clock saving `22,955 ms`. Different poll counts did not weaken the gate set.
- Gate equivalence: authoring candidate, pure Playwright, four unique `I10_2X2_V1` runs, activation, ON_DEMAND formal execution, result inbox and terminal Artifact all `true` in both modes.
- Selective replay: `197 ms`; terminal records `1→1`; run directories `1→1`; duplicate authoring and invalid full rerun avoided.
- Rollback: a real legacy L1 passed with `I10_RF006_S2_ENABLED=0`; status `VERIFIED`.
- Focused tests: bundled Node `--test tests/i10/acceptance-efficiency.test.cjs tests/i10/acceptance-baseline.test.cjs`; `17/17` passed.
- ReleaseIdentity before/after: `6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687`; publication hashes unchanged; official ledger remained `1/18`.

S3 did not publish Flowise, restart services, mutate ReleaseIdentity, promote old evidence or execute the remaining 17 variants.
