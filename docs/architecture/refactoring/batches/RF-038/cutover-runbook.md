---
id: DOC-ARCH-RF038-CUTOVER
title: RF-038 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-038 Cutover

Build `apps/quality-case-portal`, build Harness, start Harness on `127.0.0.1:18788`, then open `/quality/`. A missing frontend build must return `503 QUALITY_PORTAL_NOT_BUILT` instead of starting another server.
