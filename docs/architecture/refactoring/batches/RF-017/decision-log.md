---
id: DOC-ARCH-RF017-DECISIONS
title: RF-017 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-017 Decision Log

- Default profile is tool-free deterministic-prefetch JSON; read-tool Deep Agent remains inactive compatibility code.
- Model output cannot contain risk, approval, version or execution claims.
- All PROPOSE outcomes require an exact frozen approval in this batch; CLI-specific HIGH confirmation UX belongs to TP05.
- ANSWER and CLARIFY never enter a mutation node.
