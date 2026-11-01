---
id: DOC-ARCH-RF030-CUTOVER
title: RF-030 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Cutover

Build the Bank Channel image, start the A02 topology, call fixture seed twice with Test Support authorization, compare stable IDs, link the demo Keycloak subject, restart Bank Channel, and read the same fixture. Stop at the first deterministic failure.
