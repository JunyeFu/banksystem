---
id: DOC-ARCH-RF051-DECISIONS
title: RF-051 decision log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 decision log

- EOD orchestration moved from the HTTP controller into one owning service; no generic workflow abstraction was added.
- A session-level PostgreSQL advisory lock covers external work without wrapping Fineract calls in a local transaction.
- Pre-job and post-job reconciliation use distinct phases so a persisted pre-job result cannot mask later differences.
- LIVE business-date advance remains outside this batch's automated verification because it irreversibly changes retained Fineract demo state.
