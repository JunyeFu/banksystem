---
id: DOC-ARCH-RF054-ROLLBACK
title: RF-054 rollback runbook
document_type: rollback-runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-054 rollback runbook

On a verified transition or authorization regression, stop new loan-originations, restore the RF-053 service and portal images, and retain v15 columns because they are additive. Do not rewrite Fineract loan state or delete unrelated volumes. Existing core-submitted loans remain Fineract facts.
