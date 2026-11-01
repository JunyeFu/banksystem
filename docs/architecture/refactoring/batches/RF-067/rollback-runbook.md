---
id: RF067-ROLLBACK-RUNBOOK
title: RF-067 Rollback
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-067 Rollback

Retain additive conversation records; never delete old checkpoints/runs or undo a migration against retained data. Recover only exact owned source edits. Stop only an affected new task on unexpected writes.

