---
id: DOC-ARCH-RF010-DECISIONS
title: RF-010 Decision Log
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-010 Decision Log

1. 2026-08-25: RF-009 returned `GO_LANGGRAPH`; project execution continues to AG-01 under a new batch.
2. The MCP contract lacks mutability metadata, so RF-010 uses a reviewed, versioned overlay and exact population join.
3. Name suffixes and output levels are not authoritative mutability signals.
4. Any potentially side-effecting argument makes the whole tool `MUTATING`.
5. Unknown tools fail closed and cannot be silently treated as read-only.
6. 2026-08-25: the reviewed split is 11 READ_ONLY and 22 MUTATING. `candidate_preview` and `result_inbox_list` are MUTATING because an allowed argument may issue a grant or acknowledgement.
7. The initial import-coupling assertion matched the legitimate controller-kind string; it was narrowed to actual require/import syntax without changing implementation behavior.
8. RF-010 closes after 8/8 focused assertions and all governance/identity gates pass. AG-02 requires a new batch.
