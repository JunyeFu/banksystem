---
id: DOC-ARCH-RF021-DECISIONS
title: RF-021 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-021 Decision Log

- Lock exact `@earendil-works/pi-tui@0.84.3`; package is MIT, Node >=22.19, with two JavaScript dependencies and zero audited vulnerabilities.
- TUI state stores safe event projections and opaque refs, never raw attachment paths or submitted editor text.
- Ctrl-C always produces cancel/exit intent 130; overlays do not reinterpret it as approval.
- 2026-08-26: RF-021 closed after 11 TUI tests, 22 combined CLI tests, 523 registered product tests, zero-vulnerability dependency audit and governance validation.
