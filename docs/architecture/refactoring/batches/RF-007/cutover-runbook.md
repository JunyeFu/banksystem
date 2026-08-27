---
id: DOC-ARCH-RF007-CUTOVER
title: RF-007 Cutover Runbook
document_type: runbook
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Cutover Runbook

1. Confirm RF-006 is complete and RF-007 tasks are approved.
2. Freeze pre-cutover inspector, process ownership, publication and database readiness evidence.
3. Apply shared WorkerCodeSet implementation and focused tests.
4. Stop only package-owned services using managed STOP.
5. Start current `main` using managed START; fail closed on migration, health or ownership mismatch.
6. Publish Flowise using the public API and read back version/hash/deployed state.
7. Run inspector until all identity predicates agree.
8. Run one real L1 thin chain and compute the 18-chain reuse decision.

Do not run all 18 by default; the decision gate determines scope.

## Execution result

The runbook completed through managed lifecycle, public-API publication/readback, inspector alignment and one L1 `LIVE_E2E` proof. The exact result and Hashes are recorded in `evidence-index.md`; no all-18 rerun was started.
