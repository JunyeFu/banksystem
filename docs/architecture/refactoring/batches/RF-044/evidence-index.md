---
id: DOC-ARCH-RF044-EVIDENCE
title: RF-044 Evidence Index
document_type: evidence
domain: architecture
status: CLOSED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-044 Evidence Index

## Result

RF-044 is `PASS` for CONTRACT and INTEGRATION. Dedicated `journey approve|reject` commands require the exact session, Journey, revision, proposal ID and content hash. The service pre-reads Harness authority and performs one exact decision write only when every field matches.

## Machine evidence

- Evidence record: `agent/runs/rf044/20260903-230000/integration-result.json`
- Evidence SHA-256: `8a05914e284fa321995ea95656ca148a85e5fed27a45685009b8332ad9cc86e7`
- RF-044 Fresh Harness + real MCP matrix: 1/1 passed.
- Agent CLI package: 83/83 passed.
- Registered platform suite: 584/584 passed in 132932.5842 ms; 0 failed.
- Revision, proposal and hash drift: 3/3 rejected before decision write.
- Exact decisions: one approve and one reject; authoring, case preparation and execution calls: 0.

## Boundary

Approval reaches only Harness `PROCESSING_AUTHORING`; rejection reaches `NEEDS_INPUT`. No authoring completion, browser execution, LIVE_E2E, ReleaseIdentity freeze, release decision, commit, or push was performed. Source changed, so the previous ReleaseIdentity remains stale.
