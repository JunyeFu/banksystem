---
id: DOC-ARCH-RF010-CONTRACT
title: RF-010 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-010 Contract Delta

The existing MCP and Flowise contracts do not change. New inactive controller contracts are:

- `ControllerPort.start(input)` and `ControllerPort.resume(input)`;
- controller kinds `flowise-v7` and `langgraph-deepagents-v1`;
- result status `COMPLETED | AWAITING_USER | FAILED_CLOSED`;
- tool classes `READ_ONLY | MUTATING` with unknown default deny.

No controller gateway, traffic routing, checkpoint store or product dependency is introduced in RF-010.
