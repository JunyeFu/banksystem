---
id: DOC-ARCH-RF009-DECISIONS
title: RF-009 Decision Log
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Decision Log

1. 2026-08-25: project owner requested completion of the frozen migration plan after accepting the architecture task package.
2. RF-009 is limited to AG-00 synthetic feasibility; AG-01 and later work require a new batch after the PoC decision.
3. Flowise remains the formal baseline and rollback candidate. Dual writes are prohibited.
4. LangGraph.js is the primary candidate; Mastra is evaluated only if a deterministic LangGraph or Deep Agents boundary fails.
5. Deep Agents follows a trust-the-tools security model, so tool and backend removal is a hard test condition rather than a prompt instruction.
6. Current dependency versions and licenses must be re-read from official sources before installation.
7. The batch begins with ReleaseIdentity `02ae6b18...dc4`, ledger `0/18`, runtime unavailable and stale public readback; RF-009 cannot change or promote any of them.
8. 2026-08-25: exact versions are LangGraph.js 1.4.12 and Deep Agents JS 1.12.2 with exact compatible peers; all reviewed direct licenses are MIT, install scripts are disabled, production audit is zero and installed size is below the 256 MiB budget.
9. Windows Node does not expand the original glob and npm `cmd.exe` requires a quoted backslash executable path. Done commands were corrected before any test assertion executed.
10. 2026-08-25: S1 returns `GO_LANGGRAPH`. The decision is supported by 10/10 CONTRACT/synthetic INTEGRATION assertions, including a real Deep Agents invocation whose observed tool set is exactly `journey_get`.
11. `GO_LANGGRAPH` does not approve AG-01. The next task must establish a new control chain for product-facing `ControllerPort` and generated tool classification.
