---
id: DOC-ARCH-RF022-EVIDENCE
title: RF-022 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-022 Evidence Index

Status: CLOSED on 2026-08-26. Only CONTRACT, pure lifecycle/identity INTEGRATION and GOVERNANCE evidence is admissible; no service mutation, identity publication or LIVE evidence.

- Lifecycle/v4 matrix: 12 tests passed, 0 failed under bundled Node 24. It proves exact normal order `hz-agent -> Harness/MCP/Worker`, Flowise process/port refusal, exact ownership, real Node24/Node20 probes, cold rollback separation, v4 closure, per-file byte drift, model-binding drift, secret-field rejection, legacy staleness and Stage9 projection.
- Combined CLI regression: 34 tests passed, 0 failed.
- Source-frozen v4 candidate: identity `b709dfa998672354004547df5e43b739404e4650a6146bcb7966b2321ff5766e`, code-set `175bc745138e1b938668b93fb9192e1b9f8bcb887b8bf54376732f987d0b825f`, 115 unique governed files. Status is truthfully `SOURCE_FROZEN_UNBOUND`; it is not a publishable/live identity until the non-secret configured model binding is supplied and a new hash frozen.
- Real read-only doctor: Flowise process and port discovery succeeded, `flowiseAbsent=true`, dependencies ready, CLI Node `v24.19.0`, service Node `v20.20.2`. This is configuration/write-readiness evidence, not service health or runtime activation.
- Stage9 preflight: no missing runtime tree, source file or host tool; dirty shared source correctly yields `I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN`, with `exportCreated=false` and `archiveCreated=false`.
- Registered product suite: 524 tests passed, 0 failed; two governed media-binary prerequisites remain explicitly excluded and legacy release-state hashes stayed unchanged.
- Runtime boundary: no START, STOP, reload, endpoint call, `.data` write, identity publication or LIVE occurred. Legacy Flowise lifecycle remains a disabled, separately authorized cold descriptor.
