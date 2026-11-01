---
id: DOC-ARCH-RF041-BASELINE
title: RF-041 Baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-041 Baseline

The CLI exposed historical list/show/fork/archive commands and stored their status in a local DPAPI index. There was no formal `session start|resume|status` contract whose displayed state came from Harness after a process restart.
