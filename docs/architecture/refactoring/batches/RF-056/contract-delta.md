---
id: DOC-ARCH-RF056-CONTRACT-DELTA
title: RF-056 contract delta
document_type: contract-delta
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 contract delta

Only public shape change: `PATCH /api/operations/v1/documents/{id}/status` requires `{status,version}`. A stale version or illegal transition yields 409. No other customer, operations, transaction, accounting, or Test Support routes change. Existing `operations_document.version` supplies the compare-and-set; no schema migration is planned.
