---
id: DOC-ARCH-RF042-EVIDENCE
title: RF-042 Evidence Index
document_type: evidence
domain: architecture
status: CLOSED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-042 Evidence Index

## Result

RF-042 is `PASS` for CONTRACT, INTEGRATION, and one configured external model endpoint probe. The binding uses exactly one OpenAI-compatible model, one request per invocation, no tools, no streaming, no retry, and no fallback.

## Machine evidence

- Evidence record: `agent/runs/rf042/20260903-210000/integration-result.json`
- SHA-256: `bd68e8eb544f21236ec4aee1362243ef6ab1aadfd76de6e4f9739bcfc2338216`
- Model binding contract: 9/9 passed.
- Configured model endpoint: 1/1 passed for `deepseek-v4-flash`; only the Base URL SHA-256 is retained.
- Agent CLI package: 74/74 passed.
- Registered platform suite: 582/582 passed in 98953.5005 ms; 0 failed.
- Release state remained unchanged.

The first registered-suite attempt exposed that nested Node 24 tests suppress reporter stdout under the parent test runner. The verification wrapper was corrected to use the child exit status as authority; product behavior and assertions were not weakened. The repeated full registered suite then passed 582/582.

## Boundary

This is an endpoint capability probe, not Journey authoring or LIVE_E2E. No raw Base URL, API key, Authorization header, or response body is recorded. No ReleaseIdentity was frozen and no release decision, commit, or push was performed. Source changed, so the previous ReleaseIdentity is stale.
