---
id: DOC-ARCH-RF035-ROLLBACK
title: RF-035 Rollback Runbook
document_type: rollback
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Rollback

Stop the command and restore the RF-034 source boundary. Remove only RF-035 temporary Keycloak identities or isolated RF-035 Compose resources. Never delete or compensate a settled Fineract transfer during rollback.
