---
id: DOC-ARCH-RF009-TARGET
title: RF-009 Isolated Agent Controller Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Isolated Agent Controller Target Design

RF-009 proves only a synthetic vertical slice:

```text
synthetic harness facts
  -> hydrate authoritative projection
  -> bounded read-only planner
  -> validate and freeze proposal
  -> interrupt
  -> exact decision resume
  -> deterministic single simulated mutation
  -> synthetic harness readback reconciliation
```

LangGraph owns graph execution and checkpoint position. Deep Agents is admitted only behind a `ReadOnlyPlannerPort`; the PoC must prove that its built-in filesystem/subagent capabilities can be removed or replaced by an in-memory bounded backend. The planner never sees mutating tools.

The simulated Harness owns `journeyId`, `expectedVersion`, authoritative status and mutation records. Resume always rehydrates these facts before using checkpoint state. A mismatch returns `AGENT_CONTROLLER_AUTHORITY_CONFLICT` and performs zero mutation.

No HTTP server, MCP connection, browser, SQLite database, host filesystem tool, shell tool, credential, external model call or product package dependency is permitted.
