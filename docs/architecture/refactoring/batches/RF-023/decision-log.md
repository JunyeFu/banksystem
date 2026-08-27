---
id: DOC-ARCH-RF023-DECISIONS
title: RF-023 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-023 Decision Log

- A durable encrypted session is mandatory for normal runs; `--no-session` fails closed because exact approval cannot safely survive restart without it.
- Formal configuration is explicit: session root, namespace, journey, authenticated loopback MCP and model binding. No implicit credential discovery is added.
- Flowise absence is checked before session-store initialization and again before every local or remote write.
- Evidence and credential enrollment remain fail-closed instead of acquiring underspecified adapters.
- Cold rollback validation creates a non-executing plan only; its evidence is never reusable by the normal profile.
- Formal Stage9 package creation remains blocked by the preserved shared dirty tree; RF-023 closes local offline engineering and leaves source freeze, configured identity and LIVE to TP09.

