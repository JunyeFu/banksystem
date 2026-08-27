---
id: DOC-ARCH-RF025-EVIDENCE
title: RF-025 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Evidence Index

Status: PROPOSED. S0 governance decomposition, S1 v4 ledger and S2 offline full18 runner are complete. S3-S5 implementations are offline-ready; their real same-identity gate execution, separately authorized cold rollback and explicit human decision remain blocked.

- Evidence class created by S0: `DOC_GOVERNANCE_ONLY`.
- S1 completion snapshot: `8bd7e0c548aa1859735ca14396d22fc90329308a9629711439a15cc709f404e4`, code-set `c7fd88f5ef9e9204d20aacc3d64a265563c3b5d42b6437ef7d5f36a337047e4b`, 123 governed files.
- Current CLI v4 source candidate after S2: `e19eaea7c9aab4703fb47a6fc19b3a6a6999c1b6fac8976af254a886afdb2670`, code-set `cbd4e2615437309ff037a17127858bac19cab6cd2f756907b805e9a5761fdaa5`, 125 governed files (`agentCli=17`, `controller=18`, `mcp=4`, `lifecycle=9`, `harness=56`, `worker=21`), `SOURCE_FROZEN_UNBOUND`.
- Current CLI v4 source candidate after S3 implementation: `78abb3ab60968e1e9118c8f707c7d66cf80f0d7a28220a609b844dc103bb9a41`, code-set `05eb7ab701eaceb5d10fb2e02f78dad344d714676e70ce2d13b48f2d80c08d7b`, 126 governed files (`agentCli=17`, `controller=18`, `mcp=4`, `lifecycle=10`, `harness=56`, `worker=21`), `SOURCE_FROZEN_UNBOUND`.
- Current CLI v4 source candidate after S4/S5 implementation: `1d032c71aa65db3bdcf7352019f5d22d12c449643f1c9b9768948cfa23f2ad5e`, code-set `ebc7cd16c9c294b9729c66c1eb28bed50d4699d25d8a79e278db3a8c2f9e5fde`, 126 governed files (`agentCli=17`, `controller=18`, `mcp=4`, `lifecycle=10`, `harness=56`, `worker=21`), `SOURCE_FROZEN_UNBOUND`.
- Current runtime/readback: runtime unavailable, public readback cached and stale, `releaseAligned=false`.
- Existing v3 ledger: `0/18`; it is not CLI v4 evidence and is explicitly excluded from RF-025 acceptance.
- S1/S2 focused matrix: 24/24 under bundled Node 20 (`v4 ledger=10`, `full18 runner=12`, `Journey evidence projection=2`). It proves exact 9x2 cardinality, immutable current records, stale/cross-identity and v3 import rejection, ordered resume, exact approval pauses, ambiguous-write restart lock, first deterministic failure stop, bounded terminal authority references and post-terminal public readback using temporary roots and injected ports.
- Existing MCP contract matrix: 18/18. Node 24 lifecycle plus offline production-composition matrix: 33/33; lifecycle wrapper: 1/1. Offline SBOM remains current with 141 components.
- S3-S5 contracts: release eligibility/human boundary 14/14 and cold rollback 7/7; combined RF-025 focused matrix: 45/45. They reject incomplete/stale/cross-identity gates, prove short-circuit before expensive checks, perform one real CurrentUser DPAPI encrypt/restart/decrypt drill in an automatically removed temporary directory, require a distinct cold authorization, preserve normal evidence, stop all four injected cold services, require a final readback, and prevent unauthorized or conflicting human records. Deterministic SBOM check remains current with 141 components.
- Registered manifest: 89 files registered, 87 CI-runnable and two governed-runtime exclusions. Registered suite: 577/577 passed in 86.643 seconds, and the Flowise release-state hash set was unchanged.
- Current real release projection is read-only `NOT_READY` with `AGENT_MODEL_BINDING_REQUIRED`, `currentPassed=0`, and no downstream gate execution. No service, model, browser, runtime MCP call, formal ledger write, Flowise route, live dependency audit, publication, cold rollback or human release decision was performed. Evidence class remains STATIC/CONTRACT/INTEGRATION, not LIVE_E2E.
- Completion audit: normal CLI doctor is `READY`, Flowise is absent, write preflight is structurally ready, bundled CLI Node is `v24.19.0` and service Node is `v20.20.2`; managed Harness/MCP/Worker are all `NOT_RUNNING` with no owned PID. `.data/runtime.env` contains only the three service tokens and allowed-client configuration: model name/base URL, all three TP09 L1 input/attachment files, normal LIVE authorization, cold-rollback authorization and project-owner decision authorization are absent. L1 evidence files=`0`, v4 ledger file absent (`SOURCE_UNBOUND`, `0/18`), cold evidence files=`0`, release decision files=`0`.
- Pending evidence: TP09 same-identity L1 LIVE acceptance under a new exact authorization, same-identity 18/18 LIVE records, real S3 public/audit/DPAPI aggregation on that identity, an actually executed separately authorized cold rollback, a final same-identity readback and an explicit project-owner decision.
