---
id: DOC-ARCH-RF037-TARGET
title: RF-037 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-037 Target Design

Harness exposes a loopback-only, sanitized GET projection for overview, cases, case detail, baselines, runs, schedules, incidents and releases. Every value is derived from Harness SQLite. Writes receive `405 QUALITY_READ_ONLY`; the formal release list remains empty until immutable ReleaseIdentity evidence exists.
