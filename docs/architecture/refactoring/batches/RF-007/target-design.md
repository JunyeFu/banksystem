---
id: DOC-ARCH-RF007-TARGET
title: RF-007 Target Design
document_type: design
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Target Design

One versioned WorkerCodeSet contract defines the sorted relative paths, normalization rules and aggregate SHA-256 algorithm used by:

- ReleaseIdentity generation;
- Worker startup/runtime observation;
- Harness health/readiness projection;
- acceptance evidence and inspector comparison.

Initial authoritative set must cover at least:

1. `worker/src/index.cjs`
2. `worker/src/i10-midscene-candidate-authoring.cjs`
3. `worker/src/i8-candidate-runner.cjs`
4. `worker/src/i8-formal-runner.cjs`
5. `worker/src/i10-verification-execution.cjs`

The implementation must discover and freeze whether imported local Worker modules also affect execution; the final set is explicit, sorted and schema-versioned. Missing or extra governed files fail closed.

RF-007-S1 resolved that discovery: the authoritative V1 set contains 24 statically reachable local execution files, including eight compiled Harness support modules loaded by the Worker. The complete list and baseline Hash are frozen in `evidence/worker-code-set-baseline-2026-08-03.json`. The one dynamic candidate-script load is separately governed by candidate artifact identity.

After tests, managed STOP/START loads current `main`, Flowise is published/read back through public API, inspector proves all hashes equal, then one new L1 `LIVE_E2E` thin chain runs. Only that evidence can decide whether old 18/18 artifacts are exactly reusable or historical-only.

## Completion

RF-007-S3 completed this target on 2026-08-03. The managed runtime reports the same 24-file WorkerCodeSet Hash as ReleaseIdentity and Harness readiness, Flowise v7 was published and read back, and L1 `TEXT_ONLY` passed under ReleaseIdentity `6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687`. The former 18/18 evidence is historical-only because its identity differs; the remaining 17 variants were not authorized or rerun by RF-007.
