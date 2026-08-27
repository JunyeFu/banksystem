---
id: DOC-ARCH-RF023-CUTOVER
title: RF-023 Cutover Runbook
document_type: runbook
domain: architecture
status: DRAFT
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-023 Cutover Runbook

No cutover is authorized. TP09 must receive a separate exact LIVE authorization, bind the non-secret model identity, freeze a new v4 identity, start only the normal CLI/Harness/MCP/Worker profile and stop on the first deterministic L1 failure. The current source candidate, synthetic results and legacy Flowise evidence are not LIVE evidence.

