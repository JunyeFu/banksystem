---
id: DOC-ARCH-RF032-CUTOVER
title: RF-032 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-032 Cutover

Build the Channel and its mock-clearing dependency, start an isolated empty topology, provision only synthetic identities through Keycloak and Test Support, execute the customer create/confirm API journey through Gateway, verify Fineract balances and Channel ledger postconditions, capture a sanitized hashable result, and delete only the RF-032 resources. Browser comparison is assigned to RF-033.
