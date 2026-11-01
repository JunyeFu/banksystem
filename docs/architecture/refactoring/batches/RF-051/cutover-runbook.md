---
id: DOC-ARCH-RF051-CUTOVER
title: RF-051 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 cutover runbook

Build the Bank Channel image, replace only that Compose service, wait for health, confirm Liquibase v13, then run read-only reconciliation and the synthetic golden transfer. Keep every managed service running.
