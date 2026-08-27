---
id: DOC-ARCH-RF006-CUTOVER
title: RF-006 Cutover Runbook
document_type: runbook
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Cutover Runbook

1. Verify approved task packages and clean RF-006 scope.
2. Run focused tests with selective mode disabled.
3. Enable timing-only mode and compare outcomes.
4. Enable selective invalidation for one isolated L1 chain.
5. Compare artifact hashes, terminal results and required gates with legacy mode.
6. Keep a switch to legacy full execution until observation is complete.

Cutover does not include service restart, Flowise publication or ReleaseIdentity changes.

Completion: steps 1-6 passed on 2026-08-04. Selective execution is the default; `I10_RF006_S2_ENABLED=0` is the verified rollback switch. Evidence is `evidence/acceptance-mode-comparison-s3-2026-08-04.json`.
