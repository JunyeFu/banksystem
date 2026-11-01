---
id: DOC-ARCH-RF031-CONTRACT
title: RF-031 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-031 Contract Delta

Customer and Operations transfer POST operations explicitly require `X-Correlation-Id` in addition to `Idempotency-Key`. Existing response fields and money-as-string representation remain unchanged. This batch adds no endpoint and no compatibility fallback.
