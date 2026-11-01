---
id: DOC-ARCH-RF030-CONTRACT
title: RF-030 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Contract Delta

Baseline customer and savings-account fixtures gain stable `externalId` fields. `POST /internal/test-support/v1/fixtures:seed` becomes idempotent and returns stable runtime IDs plus per-entity `CREATED` or `REUSED` actions. Errors are non-success HTTP responses rather than a successful response containing `FAILED`.
