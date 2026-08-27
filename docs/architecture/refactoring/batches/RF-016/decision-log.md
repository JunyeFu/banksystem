---
id: DOC-ARCH-RF016-DECISIONS
title: RF-016 Decision Log
document_type: decision
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-016 Decision Log

- Use root-owned exact SDK dependency; no Flowise path fallback.
- Keep 22 mutations by extracting two conditional writes and converting two former mutating tools to pure reads.
- Store imported attachments under Harness ownership without a SQLite migration.
