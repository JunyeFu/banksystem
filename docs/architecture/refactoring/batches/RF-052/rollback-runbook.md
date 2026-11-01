---
id: DOC-ARCH-RF052-ROLLBACK
title: RF-052 rollback runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 rollback runbook

If the additive migration or replacement fails, preserve all audit, Outbox, Inbox and dead-letter rows and rebuild the prior Bank Channel image. The added columns remain compatible with the prior binary; never delete or recompute audit history to make verification pass.
