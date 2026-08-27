---
id: DOC-ARCH-RF007-BASELINE
title: RF-007 Baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Baseline

- Git commit: `9d79b7c1e6cfedd995093cc7a378dc8e9218fa98`
- Captured at: `2026-08-03T17:48:34+08:00`
- Observed ReleaseIdentity: `632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`
- Current inspector result: `releaseAligned=false`, Worker expected/observed full-set hashes differ, Flowise publication evidence is stale, and current accepted chains are `0/18`.
- Dirty tree manifest: pre-existing RF-005 decision-log edit and `.pi/`, both excluded.

Known defect: `scripts/i10-release-identity.cjs` binds only `worker/src/i10-midscene-candidate-authoring.cjs`, while runtime health computes an aggregate over five Worker files. The identity therefore cannot prove the complete Worker code set used for execution.

## RF-007-S1 archaeology result

- Static execution entry: `worker/src/index.cjs`.
- Complete statically reachable local execution set: 24 files: 16 under `worker/src` and 8 loaded compiled Harness support files under `dist/harness/src`.
- Unresolved local imports: 0.
- Dynamic local loads: one validated candidate script in `worker/src/i8-candidate-runner.cjs`; it is governed by the candidate artifact Hash and is not part of WorkerCodeSet.
- Current ReleaseIdentity single-file Hash: `3f5c348e80a0cd794429d58955362b522895834c712bdaa6077b47d1ea9fcdbd`.
- Current Worker startup five-file Hash: `58257b9f94a094ecdd260ca9354e3f3d2f7b22059f02741c4979637ae70d01bc`.
- Frozen complete-set Hash: `828f4d68da2717db95823783db0567adbdad3d397f962e99c5bb10c1dead3cba`.

The three different values prove that neither current identity producer covers the execution closure. This is a contract finding only; no running process or acceptance evidence was changed.
