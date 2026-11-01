---
id: DOC-ARCH-RF050-CONTRACT
title: RF-050 contract delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-050 contract delta

- Transfer status adds `RETURN_PENDING` and `RETURN_RESULT_UNKNOWN`.
- Reversal approval status is `PENDING | CORE_RESULT_UNKNOWN | CONFIRMED | REJECTED`.
- Idempotency records add `subject` and `operation`; the uniqueness boundary is their tuple with the original client key.
- Reversal rows persist the original core idempotency key and submission/verification timestamps.
