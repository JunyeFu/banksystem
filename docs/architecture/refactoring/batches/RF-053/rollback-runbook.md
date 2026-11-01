---
id: DOC-ARCH-RF053-ROLLBACK
title: RF-053 rollback runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-053 rollback runbook

Rebuild Bank Channel from the RF-052 source state and replace only that service. No schema rollback is required. Beneficiary rows updated to keyed tokens remain valid only with the configured server secret, so restore the matching RF-052 state if rollback is required. Do not stop the retained topology.
