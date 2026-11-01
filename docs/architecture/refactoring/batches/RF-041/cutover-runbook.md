---
id: DOC-ARCH-RF041-CUTOVER
title: RF-041 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-041 Cutover

Start Harness and MCP for the frozen identity, run `session start`, stop the CLI process, then run `session status` and `session resume` from a new process. Accept only matching sessionRef, Journey ID, version, status, and ReleaseIdentity binding.
