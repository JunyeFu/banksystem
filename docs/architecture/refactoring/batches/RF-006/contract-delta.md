---
id: DOC-ARCH-RF006-CONTRACT
title: RF-006 Contract Delta
document_type: contract
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Contract Delta

No public MCP, Harness, Flowise or banking contract changes are authorized.

Internal acceptance metadata may add:

- `stageName`, `startedAt`, `completedAt`, `durationMs`;
- `pollCount`, `retryCount`;
- `reuseDecision`, `invalidationReason`;
- `producerIdentityHash`, `inputHash`, `candidateHash`.

These fields are diagnostic and must not be interpreted as runtime success. The existing ReleaseIdentity algorithm remains unchanged in RF-006.

Closure result: the internal metadata was implemented without changing public MCP, Harness, Flowise or banking contracts. RF-006-S3 preserved the same ReleaseIdentity before and after its isolated comparison.
