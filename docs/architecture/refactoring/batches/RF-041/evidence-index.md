---
id: DOC-ARCH-RF041-EVIDENCE
title: RF-041 Evidence Index
document_type: evidence
domain: architecture
status: CLOSED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-041 Evidence Index

## Result

RF-041 is `PASS` for CONTRACT and INTEGRATION scope. The CLI session contract is `session start`, `session resume <sessionId>`, and `session status <sessionId>`. Harness Journey state read through MCP is authoritative; the DPAPI envelope remains a private controller checkpoint.

## Machine evidence

- Evidence record: `agent/runs/rf041/20260903-200000/integration-result.json`
- SHA-256: `51464f6fd8ee4ab91b6e158f760439e6d35fcce454d7b896db573c33b1d7ceb9`
- Headless contract: 16/16 passed.
- Offline integration: 16/16 passed.
- Focused verification wrappers: 5/5 passed.
- Real MCP with Fresh Harness and Fresh SQLite, followed by CLI service reconstruction: 1/1 passed.
- Registered platform suite: 581/581 passed in 99536.8722 ms; 0 failed.
- Refactoring and documentation validators pass at closure.

During implementation, the integration topology first exposed a Node 24 versus Node 20 native SQLite ABI mismatch; the test now starts the real Harness with its locked Node 20 runtime. The real MCP call then exposed the required explicit `supportingImages` array; the caller was corrected without weakening the Harness contract.

## Boundary

No model call, bank transaction, LIVE_E2E, ReleaseIdentity freeze, release decision, commit, or push is evidenced here. Source changed, so the previous ReleaseIdentity is stale.
