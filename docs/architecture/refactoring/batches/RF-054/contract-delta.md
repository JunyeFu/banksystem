---
id: DOC-ARCH-RF054-CONTRACT
title: RF-054 contract delta
document_type: contract-delta
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-054 contract delta

- Customer loan creation returns DRAFT and requires amount, term, purpose and a controlled repayment method; submit requires the returned version.
- Customer list and detail expose the complete local-to-core state, quoted and approved values, core loan ID and controlled documents.
- Operations list, detail, score, approval request, checker approval and core-submit use explicit versioned request bodies.
- Core-submit is operations-only and requires an idempotency key. The obsolete customer core-submit contract is removed.
- Document creation accepts only document type; Bank Channel creates the controlled reference.
