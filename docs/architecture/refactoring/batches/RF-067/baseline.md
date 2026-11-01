---
id: RF067-BASELINE
title: RF-067 Baseline
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-067 Baseline

## 2026-10-21 implementation entry

Explicit user authorization received for RF067-S1 implementation, testing and review, preserving existing services. Order/batch/slice/task chain verified. Current checkout remains main@552b3b8ac517bd5991bff446e72d9f4e87ea9543 with 549 existing status entries; do not stage/reset unrelated work. Latest migration is 043, so this batch owns only additive 044. HarnessDatabase.write already provides queued immediate short transactions; workbench persistence must use it. MCP defaults to 8KiB and Harness has an absolute 128KiB output ceiling. Use scoped paging, not a global budget change.

Read-only Docker baseline: all original 15 containers remain running (29h uptime), retaining the same IDs observed at entry. No Docker command other than ps, model call, live database access or service mutation was performed. Tests will use owned temporary SQLite/processes and OS-assigned loopback ports, never existing listeners or volumes.

Baseline is the same inspected checkout and preserved runtime documented in [RF066 baseline](../RF-066/baseline.md). No source files, schema, secret or running state have changed in this batch. Recheck only affected paths before implementation.

