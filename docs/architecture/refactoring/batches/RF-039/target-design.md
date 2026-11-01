---
id: DOC-ARCH-RF039-TARGET
title: RF-039 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-039 Target Design

Managed lifecycle passes the frozen identity to Harness. Harness writes it on each newly enqueued run. The read model returns the persisted Journey and ReleaseIdentity plus a Correlation ID only when a run artifact explicitly records one. Historical missing fields remain visibly unbound.
