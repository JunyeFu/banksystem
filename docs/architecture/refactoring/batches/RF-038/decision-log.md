---
id: DOC-ARCH-RF038-DECISIONS
title: RF-038 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-038 Decisions

- Serve static assets from Harness instead of adding an Nginx service or port.
- Use a dedicated immutable knowledge snapshot view to complete the nine-view information architecture.
- Replace fake write controls with explicit read-only status; do not add no-op handlers.
