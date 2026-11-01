---
id: DOC-ARCH-RF047-CUTOVER-RUNBOOK
title: RF-047 cutover-runbook
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-08
owner: Codex
---
# RF-047 cutover-runbook

S1 only changes source and offline fixtures. Before S2, freeze a new configured-model ReleaseIdentity and synthetic L1 text/image files with expected outcomes. Use preflight:agent:l1, then run:agent:l1 and exact approve:agent:l1 checkpoints. Only after TEXT_ONLY verifies may TEXT_WITH_IMAGE run. First deterministic failure stops validation; retain evidence and stop owned services.

