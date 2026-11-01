---
id: DOC-ARCH-RF035-DECISIONS
title: RF-035 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Decisions

- Keep settled Fineract and Channel transaction history; never compensate a successful demo transfer.
- Delete only temporary identity mappings and Keycloak objects. Retain a beneficiary when a historical transfer references it.
- Give Mock Clearing a fixed local image tag so isolated Compose project names do not change image identity.
- Do not retain authentication-bearing browser traces in this API-only batch.
