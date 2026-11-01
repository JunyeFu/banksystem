---
id: DOC-ARCH-RF056-ROLLBACK-RUNBOOK
title: RF-056 rollback runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 rollback

For each failed slice, revert only that slice's scoped source/config changes against the captured dirty-tree baseline, then replace only its affected service. Never erase Fineract transactions, Channel database, Keycloak realm, Agent evidence, or Docker volumes. If S1 issuer/audience cutover denies valid users, restore the previously working Bank Channel image/config while retaining Keycloak state; re-enter S1 after token claim diagnosis. Document status data is not rolled back by direct SQL.
