---
id: DOC-ARCH-RF042-ROLLBACK
title: RF-042 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-042 Rollback

If output exposes a secret, the probe retries, doctor diverges, or a fallback appears, stop and remove only RF-042 model-probe changes. Do not alter local credential files or other dirty-tree work.
