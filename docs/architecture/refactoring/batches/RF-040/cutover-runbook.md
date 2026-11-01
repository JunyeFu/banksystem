---
id: DOC-ARCH-RF040-CUTOVER
title: RF-040 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-040 Cutover

Build and start the declared bank and Agent topology, bind the three BYOK variables, then run `hz-agent doctor`. Only an ordered six-check READY result may admit authoring work; any NOT_READY result ends the attempt with exit 3.
