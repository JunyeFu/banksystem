---
id: DOC-ARCH-RF046-CUTOVER
title: RF-046 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-06
owner: Codex
---
# RF-046 Cutover

Freeze the source-derived identity after focused gates pass. Start the owned composition, require `doctor=READY`, author and approve one read-only Journey, execute it once, then verify that same Journey through the CLI. Stop on the first deterministic failure and only perform owned-service shutdown. A source change after the run invalidates the runtime result and requires a new identity and new Journey.
