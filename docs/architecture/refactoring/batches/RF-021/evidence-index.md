---
id: DOC-ARCH-RF021-EVIDENCE
title: RF-021 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-021 Evidence Index

Status: CLOSED on 2026-08-26. Only CONTRACT, snapshot/fake-terminal INTEGRATION and GOVERNANCE evidence is admissible; no production runtime or LIVE evidence.

- Dependency: exact `@earendil-works/pi-tui@0.84.3` with `marked@18.0.5` and `get-east-asian-width@1.6.0`; install scripts were disabled during acquisition and production dependency audit reports zero vulnerabilities.
- TUI matrix: 11 tests passed, 0 failed under bundled Node 24.19.0. Coverage includes shared event reduction, exact 40/80/120-column and 12/24/40-row layouts, Chinese/emoji width, deterministic resize, HIGH approval suffix, redirect denial, every slash command, attachment path non-retention, submitted-text non-retention, Ctrl-C 130 and fake terminal/overlay restoration.
- Combined CLI regression: 22 tests passed, 0 failed across headless and TUI surfaces.
- Registered product suite: 523 tests passed, 0 failed; two governed media-binary prerequisite exclusions remain explicit. Release-state hashes were unchanged.
- Architecture: TUI owns only safe event projections and emits intents. It does not derive Journey state, mutate proposals or call Controller/MCP.
- Runtime boundary: all interaction used pure state, snapshots and a fake terminal. No formal `.data`, production composition, real terminal session, service start, model/MCP call, LIVE, identity freeze or publication occurred.
- Identity boundary: legacy v3 remains unfrozen and does not include `agent-cli`; TP07 remains the complete ReleaseIdentity v4 freeze gate.
