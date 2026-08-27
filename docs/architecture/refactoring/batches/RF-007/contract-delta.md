---
id: DOC-ARCH-RF007-CONTRACT
title: RF-007 Contract Delta
document_type: contract
domain: architecture
status: FROZEN
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Contract Delta

ReleaseIdentity advances to a versioned schema containing:

- `workerCodeSetVersion`;
- `workerCodeSetFiles` or a separately hashed manifest reference;
- `workerCodeSetHash`;
- the existing single-file hash retained only as a deprecated compatibility field if consumers require it.

Harness health and inspector expose expected and observed WorkerCodeSet version/hash. Any mismatch sets business readiness false. Public MCP tool schemas and banking APIs do not change.

Historical identities remain readable; they cannot certify the new full-set predicate unless the complete historical file set can be reconstructed and hashed with the frozen algorithm.

## Frozen WorkerCodeSet V1 semantics

- Entry: `worker/src/index.cjs`.
- Membership: the explicit 24-file list in `evidence/worker-code-set-baseline-2026-08-03.json`.
- Path form: product-root-relative POSIX paths.
- Ordering: ascending ordinal string order.
- Per-file bytes: exact repository bytes; no newline, encoding or source normalization.
- Aggregate stream per file: `relativePath + NUL + rawBytes + NUL`.
- Digest: SHA-256 over the complete aggregate stream.
- Missing governed file: fail closed.
- Newly reachable local file absent from the frozen manifest: fail closed.
- External package/runtime assets remain governed by the portable runtime asset manifest, not duplicated in WorkerCodeSet.
- The validated candidate script dynamic load remains governed by its candidate/script Hash and certificate identity.

RF-007-S2 provides one shared implementation of these semantics to ReleaseIdentity, Worker startup, Harness health/readiness and the inspector. Parallel private file lists are prohibited.

## Source implementation status

RF-007-S2 implemented the frozen semantics in source on 2026-08-03. ReleaseIdentity, Worker health, Harness readiness and managed lifecycle now share `scripts/i10-worker-code-set.cjs` and `scripts/i10-worker-code-set-v1.json`. Inspector compatibility is preserved through the complete-set values projected as `expectedCodeVersion` and `observedCodeVersion`, while ReleaseIdentity exposes the explicit V1 fields. RF-007-S3 subsequently completed managed reload, public-API publication readback, runtime alignment and one current-identity L1 `LIVE_E2E` proof.
