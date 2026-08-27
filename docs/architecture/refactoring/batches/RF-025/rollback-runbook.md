---
id: DOC-ARCH-RF025-ROLLBACK
title: RF-025 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Rollback Runbook

For S0, remove only RF-025 governance files and restore the exact TP10 portfolio references. For later offline slices, restore only the v4 ledger/orchestrator/release-decision sources and tests; never delete formal `.data`, v3 evidence or user sessions. During LIVE, stop only exact owned normal-profile processes. Never roll back by editing terminal evidence. Cold rollback uses its own runbook and authorization and must leave normal-profile evidence untouched.

If a cold drill fails after start, invoke only its exact owned `i9-lifecycle stop`; failure to prove all four services stopped is a cleanup failure, not rollback evidence. Never overwrite or delete a cold evidence record or human decision. A later source change creates a new identity and therefore a new eligibility/decision key.
