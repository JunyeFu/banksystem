---
id: DOC-ARCH-RF009-CUTOVER
title: RF-009 Cutover Runbook
document_type: runbook
domain: architecture
status: deferred
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Cutover Runbook

RF-009 has no production cutover. Its only terminal decision is `GO_LANGGRAPH`, `TRY_MASTRA` or `NO_GO`.

`GO_LANGGRAPH` authorizes planning AG-01/RF-010; it does not authorize product dependency installation, shadow traffic, service start, publication or LIVE_E2E. Those actions require their own control chain and gates.
