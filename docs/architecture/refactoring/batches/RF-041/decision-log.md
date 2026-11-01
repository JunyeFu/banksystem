---
id: DOC-ARCH-RF041-DECISIONS
title: RF-041 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-041 Decisions

- Reuse the existing Journey/sessionRef contract instead of adding a parallel session database.
- Use HELP/NONE only as a minimal resumable control Journey; authoring remains a later explicit command.
- Resume is an authoritative read and never an approval or execution shortcut.
