---
id: DOC-ARCH-RF050-TARGET
title: RF-050 target design
document_type: target-design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-050 target design

The transfer creation scope is `subject + operation + client key`. Processing persists one risk decision before core submission: ALLOW advances, REVIEW pauses, and BLOCK fails. Returns pass through `RETURN_PENDING` or `RETURN_RESULT_UNKNOWN` before `RETURNED`. Reversal submission is claimed once; re-entry only reads Fineract using the original key, and a second checker cannot take over the in-flight reversal.
