---
id: DOC-ARCH-RF031-CUTOVER
title: RF-031 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-031 Cutover

Build the Bank Channel image, start fresh isolated Core and Channel projects, seed RF-030 fixtures, capture both Fineract balances, submit and process one transfer, repeat idempotent calls, capture readbacks and hashes, then stop and delete only the labelled RF-031 projects. Original project containers and volumes remain untouched.
