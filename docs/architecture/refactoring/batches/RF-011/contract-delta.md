---
id: DOC-ARCH-RF011-CONTRACT
title: RF-011 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-011 Contract Delta

RF-011 implements the inactive `langgraph-deepagents-v1` side of the existing ControllerPort. Injected ports are `readJourney`, `invokeReadTool` and `invokeMutation`. No MCP/Harness public API or database contract changes.

Stable failure codes cover proposal schema/hash, approval, expiry, version, authority, mutation-limit and reconciliation failures.
