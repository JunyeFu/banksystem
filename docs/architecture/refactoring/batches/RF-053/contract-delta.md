---
id: DOC-ARCH-RF053-CONTRACT
title: RF-053 contract delta
document_type: contract-delta
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-053 contract delta

No public OpenAPI shape changes. Existing account, transaction, statement, and beneficiary fields now derive only from Fineract or server-owned persistence. Invalid upstream read models return `FINERACT_READ_MODEL_INVALID` without the upstream body. The internal generic savings-command surface is removed.
