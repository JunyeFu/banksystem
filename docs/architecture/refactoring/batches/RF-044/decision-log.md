---
id: DOC-ARCH-RF044-DECISIONS
title: RF-044 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-044 Decisions

- Use dedicated approve/reject commands, not the historical generic resume path.
- Require the full frozen tuple on every decision.
- Send an empty compatibility payload so only Harness-owned frozen payload is authoritative.
- Stop at the post-decision Journey stage; authoring and execution remain separate tasks.
