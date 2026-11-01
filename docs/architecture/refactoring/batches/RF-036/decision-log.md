---
id: DOC-ARCH-RF036-DECISIONS
title: RF-036 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-036 Decisions

- Normalize the observed active status at the presentation boundary; do not change the banking contract.
- Retain screenshots and sanitized assertions only. Delete playwright-cli session files because login state is memory-bearing.
- Count and balances come from live APIs, never from preview-image sample values.
