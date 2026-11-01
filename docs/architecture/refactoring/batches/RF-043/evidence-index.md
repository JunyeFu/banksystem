---
id: DOC-ARCH-RF043-EVIDENCE
title: RF-043 Evidence Index
document_type: evidence
domain: architecture
status: CLOSED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-043 Evidence Index

## Result

RF-043 is `PASS` for CONTRACT and INTEGRATION. `journey author` converts one natural-language goal into a strict candidate with one tool-free model call, then freezes it through MCP in Harness as `READY_FOR_CASE_APPROVAL`. `journey validate` reads the same proposal hash and counts without a model call or write.

## Machine evidence

- Evidence record: `agent/runs/rf043/20260903-220000/integration-result.json`
- Evidence SHA-256: `d1b936fe419bc1996833edef7703ad72eb679c77ea8cdb23a207e410ff97c113`
- RF-043 focused matrix: 6/6 passed, including fake model + real MCP + Fresh Harness.
- Agent CLI package: 81/81 passed.
- Registered platform suite: 583/583 passed in 178724.6821 ms; 0 failed.
- Invalid/unknown model output and partial transfer inputs stop before MCP.
- Approval calls: 0. Execution calls: 0.

One full-suite attempt exposed a stale headless wrapper count after the new CLI test was added; the count contract was updated from 16 to 17. A later file-budget review consolidated three RF-043 test files into one without reducing the six assertions. The final current-layout suite passed.

## Boundary

The configured endpoint capability was already proven by RF-042, but RF-043 did not execute real-BYOK authoring or LIVE_E2E. No approval, browser execution, ReleaseIdentity freeze, release decision, commit, or push was performed. Source and identity manifests changed, so the previous ReleaseIdentity is stale.
