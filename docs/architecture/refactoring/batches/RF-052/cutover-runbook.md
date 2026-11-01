---
id: DOC-ARCH-RF052-CUTOVER
title: RF-052 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 cutover runbook

Build and replace only Bank Channel, wait for health, confirm both Liquibase v14 changesets, verify the retained audit chain through an authenticated operations call, then run the synthetic golden transfer. Do not stop the remaining managed services.
