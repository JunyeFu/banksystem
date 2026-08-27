---
id: DOC-ARCH-RF018-DECISIONS
title: RF-018 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-018 Decision Log

- MCP transport is exact `http://127.0.0.1:<port>/mcp` with process-scoped bearer token.
- Mutations have zero automatic retry; duplicate idempotency keys fail closed.
- HTTP/MCP transport success never overrides a business error envelope.
- Actual endpoint/model capability probes remain deferred to TP08/TP09 gates.
