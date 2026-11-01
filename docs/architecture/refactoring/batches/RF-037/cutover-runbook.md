---
id: DOC-ARCH-RF037-CUTOVER
title: RF-037 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-037 Cutover

Build Harness and the Quality Portal, start Harness on `127.0.0.1:18788`, then read `/api/quality/v1/overview` without a token. Do not promote release state from this batch.
