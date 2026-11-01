---
id: DOC-ARCH-RF057-ROLLBACK
title: RF-057 rollback
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# Recovery

Stop the owned load handle, preserve reports and business history, read back ambiguous transactions by the original key/correlation, and remove only test-created identities after readback. Do not automatically reverse transfers, delete ledger entries or retry unknown side effects. Restore only RF-057 code if a runner is defective; retain inherited work and services. No volume or database cleanup.
