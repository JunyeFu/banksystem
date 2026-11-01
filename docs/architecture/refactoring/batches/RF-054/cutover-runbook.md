---
id: DOC-ARCH-RF054-CUTOVER
title: RF-054 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-054 cutover runbook

Build Bank Channel, Customer Portal and Operations Console, replace only those three retained containers, wait for health, confirm both v15 change sets in `databasechangelog`, and execute the loan workflow test. Do not stop Fineract, Keycloak, Gateway, observability, databases or Agent services.
