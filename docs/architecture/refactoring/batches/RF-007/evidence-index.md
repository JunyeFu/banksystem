---
id: DOC-ARCH-RF007-EVIDENCE
title: RF-007 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Evidence Index

Status: RF-007-S1, S2 and S3 `COMPLETED`. Current main is the active managed runtime.

Available evidence:

- `evidence/worker-code-set-baseline-2026-08-03.json`: 24-file import closure, frozen aggregate algorithm, three current Hashes and exact expected-red characterization outcome.
- `platform/hengzhun-regression-system/scripts/i10-worker-code-set-audit.cjs`: reproducible static closure and Hash computation.
- `platform/hengzhun-regression-system/tests/i10-release-identity-worker-set.test.cjs`: two green contract assertions plus one deliberate red identity assertion.
- RF-007-S2 source result: the former red assertion is replaced by nine green WorkerCodeSet consumer tests; Harness build and the 28-test focused compatibility set pass.
- RF-007-S2 source identity: `hengzhun-i10-release-identity-v2`; identity Hash `ca8254c808e7874ea2c26463198250f6cda920d9ca067ce9551b7940d5c4aa12`; WorkerCodeSet manifest Hash `749ca3fd394421824c76ed75dafee2c96f9eb77d4a21e1378343fec296bdfe1d`; WorkerCodeSet Hash `bf2d2e7ed026a7f3a3e05bd9e9204328b4f18f5ce356e4afaed5305cf766e198`.
- S2 did not reload services, publish Flowise or write acceptance state. These Hashes are source/contract evidence, not current runtime acceptance.

RF-007-S3 final evidence:

- WorkerCodeSet manifest and hash algorithm tests;
- pre-cutover snapshot `C:\tmp\rf007-s3-before.json`: runtime identity `632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`, `currentPassed=0/18`, `releaseAligned=false`;
- final focused tests `18/18` passed;
- managed STOP succeeded for Harness, MCP, Worker and Flowise;
- the first current-main START failed closed at Harness with `MIGRATION_DRIFT: 001_i2_core.sql`; the approved portability fix then normalized only CRLF transport for checksum identity and preserved semantic drift rejection;
- read-only proof: `36/36` Git migration blobs match SQLite checksums, `0/36` Windows working-tree migration bytes match because `core.autocrlf=true` and SQL EOL is unspecified;
- current-main managed runtime: four owned/current/healthy services, migration `36/36`, WorkerCodeSet `WORKER_CODE_SET_V1`, expected/observed 24-file Hash `bf2d2e7ed026a7f3a3e05bd9e9204328b4f18f5ce356e4afaed5305cf766e198`;
- Flowise v7 public API readback: source `eb1c56edeae6ff2d21fc341378a197d8b5d87f10337ed6d8f54498d6c7d87191`, deployed `c4878709c4d0c0b169e72d2c340b1376c2fac961be849826d88b84dc6b8a5e27`, `deployed=true`;
- inspector snapshot `C:\tmp\rf007-s3-complete.json`: ReleaseIdentity `6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687`, `releaseAligned=true`;
- L1 `TEXT_ONLY` `LIVE_E2E`: record `acceptance_9e36d520-035d-4b58-8fcd-e27e0b63c08a`, current ledger `1/18`;
- timing ledger: final L1 completed in `84,953 ms` (`scenario_prepare=28 ms`, `flowise_conversation=84,751 ms`, `terminal_finalize=174 ms`); earlier fail-closed attempts remain non-terminal historical evidence;
- reuse decision: old 18/18 identity is unequal and cannot be reused; 17 remaining variants require separately authorized current-identity runs.

Historical 18/18 records remain readable but are not current acceptance evidence.
