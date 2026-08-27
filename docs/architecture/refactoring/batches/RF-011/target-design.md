---
id: DOC-ARCH-RF011-TARGET
title: RF-011 Agent Kernel Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-011 Agent Kernel Target Design

The inactive kernel implements:

```text
hydrate Harness facts -> Deep Agents read-only plan -> schema validate -> deterministic freeze
-> LangGraph interrupt -> exact decision -> rehydrate/compare -> one injected mutation
-> Harness readback reconcile -> ControllerResult
```

Deep Agents receives a single `governed_read` tool. Its schema restricts `toolName` to the 11 reviewed read-only names; the broker rechecks the RF-010 policy before invocation. Proposal output may name one of the 22 mutating tools, but only the graph's `execute_one_mutation` node can call the mutation port.

Checkpoint uses in-memory `MemorySaver` in RF-011 and stores only references/projections. Persistent storage, retention and trace redaction belong to AG-03.
