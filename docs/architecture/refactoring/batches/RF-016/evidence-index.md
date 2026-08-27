---
id: DOC-ARCH-RF016-EVIDENCE
title: RF-016 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-016 Evidence Index

Status: CLOSED on 2026-08-26. Evidence classes are CONTRACT, isolated INTEGRATION and GOVERNANCE. No LIVE_E2E or release evidence is admitted.

- Dependency boundary: root `@modelcontextprotocol/sdk@1.30.0` and `zod@4.4.3` resolve without Flowise; production dependency audit reports zero vulnerabilities.
- Build: Harness typecheck and build exit 0.
- Focused verification: 57 tests passed, 0 failed across MCP v2 decoupling, controller-port compatibility, MCP interaction contract and terminal-evidence checks.
- Registered verification: 517 tests passed, 0 failed. Image/video ONNX OCR probes were explicitly excluded because their governed ignored model/FFmpeg prerequisites are absent; they are not part of the changed MCP/controller contract axis.
- Contract result: 35 tools have one classification each: 13 READ_ONLY and 22 MUTATING. `candidate_get`, `candidate_preview` and `result_inbox_list` are pure reads; compile and inbox acknowledgement are explicit mutations.
- Attachment result: Harness owns binary import, digest verification, safe filenames and opaque `AttachmentReceiptV1`; the normal MCP contract exposes `attachmentRef` and does not expose host paths.
- Governance: RF-016 refactoring validator, temporal validator and documentation validator exit 0; `git diff --check` exits 0.
- Release boundary: inspector computed an unfrozen source candidate `03b6b55797832af8979f97a2dc6b5f6730c3abb680d76fde4f4ad2d8ba815dfa`. Runtime is unavailable, public evidence is stale, release alignment is false and the formal ledger remains 0/18 current. This candidate was not frozen or published.
