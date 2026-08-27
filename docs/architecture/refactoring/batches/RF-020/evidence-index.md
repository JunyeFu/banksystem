---
id: DOC-ARCH-RF020-EVIDENCE
title: RF-020 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-020 Evidence Index

Status: CLOSED on 2026-08-26. Only CONTRACT, injected offline INTEGRATION and GOVERNANCE evidence is admissible; no TUI, formal session root, runtime or LIVE evidence.

- CLI matrix: 11 tests passed, 0 failed under bundled Node 24.19.0. Coverage includes every baseline command, strict option grammar, stdin/file UTF-8, attachment bytes/hash/reference projection, exact golden streams, approval exit 20, approve/reject, unsafe result rejection, cancellation 130 and broken pipe.
- Executable smoke: `version` emitted two parseable `hengzhun-cli-event/v1` lines and exited 0 with runtime `UNBOUND`; `--yes` emitted `AUTO_APPROVAL_FORBIDDEN`, wrote only the diagnostic code to stderr and exited 2.
- Safety: raw input and attachment paths are never passed to the service; attachments cross the boundary as bounded bytes, base64url basename, size and SHA-256, while output exposes only the returned opaque reference. Command result projection rejects secret-like keys and absolute Windows paths.
- Registered product suite: 522 tests passed, 0 failed; two governed media-binary prerequisite exclusions remain explicit. Release-state hashes were unchanged.
- Governance: RF-020 and documentation validators pass; final temporal validator and `git diff --check` are closure checks.
- Runtime boundary: the dispatcher used injected fakes. The executable deliberately reports `UNBOUND`; TP07 owns production composition. No TUI, `.data`, service start, real model/MCP call, LIVE, identity freeze or publication occurred.
- Identity boundary: legacy v3 calculator remains the unfrozen `fda94df59b0b9cc05eb156d6d9092a694a84eaa0b96f91552b086dedd4474334` because it does not cover `agent-cli`. TP07 must introduce and freeze complete ReleaseIdentity v4.
