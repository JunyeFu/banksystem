---
id: DOC-ARCH-RF017-EVIDENCE
title: RF-017 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-017 Evidence Index

Status: CLOSED on 2026-08-26. Evidence classes are CONTRACT, isolated INTEGRATION and GOVERNANCE only. No configured-model capability, LIVE_E2E or release evidence is admitted.

- Controller v2 matrix: 23 tests passed, 0 failed. It covers ANSWER/CLARIFY/PROPOSE, tool-free deterministic prefetch JSON, complete risk policy, immutable arguments, exact approval, expiry, hash/version tamper, target/authority drift, cross-namespace/journey denial, start/resume replay and readback mismatch.
- Controller package regression: 46 tests passed, 0 failed across v1 compatibility, v2, ReleaseIdentity v3 compatibility, Shadow and checkpoint security.
- Registered product suite: 519 tests passed, 0 failed. Two ONNX media probes remain explicit CI prerequisite exclusions because their governed ignored model/FFmpeg assets are absent.
- Dependency audit: controller production audit reports zero vulnerabilities.
- Governance: RF-017 refactoring validator, temporal consistency validator and documentation validator pass; `git diff --check` exits 0.
- Activation boundary: v2 manifest is `INACTIVE`, model binding is `UNBOUND_INACTIVE`, and tool mode is `NONE`. No configured model or runtime was called.
- Identity boundary: the legacy v3 calculator currently emits unfrozen candidate `d35cc71109b5e61dd95aa706540ad32e8f2914051a14a0d6f06f94b4980fc67a`; by design it does not yet govern all v2 files. ReleaseIdentity v4 coverage and freezing belong to TP07, so this value is not publishable evidence.
