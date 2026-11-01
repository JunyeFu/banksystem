---
id: DOC-ARCH-RF035-VERIFY
title: RF-035 Verification Plan
document_type: verification
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Verification

STATIC parses both PowerShell entrypoints. CONTRACT checks that the runner contains every required API hop and no Docker exec, psql, transfer deletion or compensating account transfer. INTEGRATION starts isolated Fresh Core and Channel volumes, executes the runner twice, and verifies exact correlation uniqueness, two ledger entries, 100 CNY balance deltas and zero temporary identity objects. This is not CLI Agent LIVE_E2E or Full18 evidence.
