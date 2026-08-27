---
id: DOC-ARCH-RF019-EVIDENCE
title: RF-019 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-019 Evidence Index

Status: CLOSED on 2026-08-26. Only CONTRACT, isolated Windows integration and GOVERNANCE evidence is admissible; no formal session root or LIVE evidence.

- Dependency: controller locks `@primno/dpapi@2.0.1`; install scripts were not run during acquisition, real CurrentUser protect/unprotect succeeded under bundled Node 20 and Node 24, and production dependency audit reports zero vulnerabilities.
- Session matrix: Node 20 and Node 24 each passed 10 tests with 0 failures. Coverage includes byte-level plaintext exclusion, release/namespace/thread/journey drift, ciphertext tamper, simulated cross-user failure, schema drift, failed atomic replacement, expiry/archive/purge, 30-day default retention, archived-runtime refusal and fork clearing checkpoint/pending approval.
- Restart integration: an exact pending `journey_input_submit` proposal survived controller reconstruction through encrypted checkpoint and proposal storage, resumed once, reconciled version 5 and cleared frozen arguments; no plaintext input or proposal arguments appeared in the envelope.
- Controller regression: 75 tests passed, 0 failed, including the existing five-minute approval-expiry gate.
- Registered product suite: 521 tests passed, 0 failed; two governed media-binary prerequisite exclusions remain explicit. Release-state hashes were unchanged.
- Governance: RF-019 and documentation validators pass; final temporal validator and `git diff --check` are closure checks.
- Runtime boundary: all controller/model/MCP interaction used injected fakes and OS temporary roots. No formal `.data` write, service start, real endpoint call, LIVE, ledger write, identity freeze or publication occurred.
- Identity boundary: legacy v3 calculator emits unfrozen candidate `fda94df59b0b9cc05eb156d6d9092a694a84eaa0b96f91552b086dedd4474334`, but its controller manifest still covers only 10 legacy files. TP07 remains the complete ReleaseIdentity v4 freeze gate.
