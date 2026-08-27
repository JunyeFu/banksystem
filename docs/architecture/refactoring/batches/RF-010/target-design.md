---
id: DOC-ARCH-RF010-TARGET
title: RF-010 Controller Contract Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-010 Controller Contract Target Design

`controller/src/controller-port.cjs` defines the framework-neutral `start/resume` seam and validates stable results. `FlowiseAdapter` only delegates existing calls; it does not publish or reinterpret Flowise state.

`controller/tool-policy-v1.json` is a reviewed overlay on the active MCP tool population. `controller/src/tool-policy.cjs` joins both sources and fails when a tool is missing, duplicated, inactive, or unknown.

Tools that may produce a side effect under any allowed argument are `MUTATING`, including `candidate_preview` (download grant) and `result_inbox_list` (acknowledgement). The planner allowlist is exactly the `READ_ONLY` projection; mutation execution receives the `MUTATING` projection only through later deterministic graph work.
