---
id: DOC-ARCH-RF035-TARGET
title: RF-035 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Target Design

`demo.ps1 run-golden-path` admits only a READY topology and delegates to one API orchestrator. The orchestrator creates short-lived synthetic Keycloak identities, seeds stable Fineract fixtures through authorized Test Support, transfers 100.00 CNY through Gateway customer APIs, confirms through the subject-scoped endpoint, and reads the same correlation through customer, operations and ledger projections. Fineract account reads prove exact debit, credit and conservation. Cleanup removes only ephemeral identity material; settled business history remains immutable.
