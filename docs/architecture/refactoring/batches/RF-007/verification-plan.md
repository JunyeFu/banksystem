---
id: DOC-ARCH-RF007-VERIFY
title: RF-007 Verification Plan
document_type: test_plan
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Verification Plan

1. Unit tests freeze path sorting, line-ending/byte semantics, missing files, extra governed files and aggregate hashing.
2. Contract tests prove ReleaseIdentity, Worker runtime and Harness health consume the same manifest and algorithm.
3. Managed lifecycle tests prove old processes are detected and current code is reloaded.
4. Public API readback proves Flowise flow ID, version, normalized content hash and `deployed=true`.
5. Inspector must report source, runtime, publication and WorkerCodeSet alignment.
6. One new L1 `LIVE_E2E` chain must complete under the new identity.
7. A written reuse decision evaluates every old 18/18 producer identity and artifact dependency; unknown equivalence means rerun required.

## Verification result

All seven gates were executed for RF-007-S3. Current inspection remains `releaseAligned=true`, migration is `36/36`, the expected and observed WorkerCodeSet Hashes match, and the current ledger contains one L1 `TEXT_ONLY` `LIVE_E2E` record. Old 18/18 reuse was rejected by exact ReleaseIdentity mismatch.
