---
id: RF068-ROLLBACK-RUNBOOK
title: RF-068 Rollback
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Rollback

Restore only this batch's entry/build/source changes. Do not overwrite existing Quality UI or reset the dirty checkout. Stop only the newly owned web process, never the Docker stack.

