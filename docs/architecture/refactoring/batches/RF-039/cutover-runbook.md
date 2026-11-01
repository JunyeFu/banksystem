---
id: DOC-ARCH-RF039-CUTOVER
title: RF-039 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-039 Cutover

Freeze a new ReleaseIdentity, start managed services with exact authorization, let Harness apply migration 040, then execute a new approved run. Confirm the run row and `/api/quality/v1/runs` return the same identity before any LIVE claim.
