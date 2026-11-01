---
id: DOC-ARCH-RF032-CONTRACT
title: RF-032 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-032 Contract Delta

Add `POST /transfers/{transferId}/confirm` to the Customer API. It is authenticated, subject-scoped and idempotent by transfer terminal state, and returns the existing full `Transfer` schema. Existing create and read endpoints remain unchanged.
