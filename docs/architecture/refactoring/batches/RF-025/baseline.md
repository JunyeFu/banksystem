---
id: DOC-ARCH-RF025-BASELINE
title: RF-025 Baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Baseline

Captured from `main` at Git `9d79b7c1e6cfedd995093cc7a378dc8e9218fa98` in the existing shared dirty tree. The current CLI Agent source candidate is v4 identity `0c864c0bc2718a0a9076d23cba2b37f71cff60e76290a0ed88309a0652fc903a`, status `SOURCE_FROZEN_UNBOUND`, code-set `7c6768261345a745b9dd5484bf75e1bc47f59eaa2658a62643b762e90cb74634`, with 122 governed files.

Read-only inspection at `2026-08-26T09:12:11Z` reports managed runtime `UNAVAILABLE`, cached and stale public readback, `releaseAligned=false`, and the existing Flowise-era v3 ledger at `0/18` with 228 stale historical records and one checkpoint. TP09 has no current CLI LIVE authorization and is not accepted.

The existing `i10-acceptance-ledger-v3` computes a Flowise ReleaseIdentity and therefore cannot be used as the acceptance authority for a bound CLI Agent v4 identity. TP10 also has no dedicated RF batch. RF-025 begins by closing only this governance/decomposition gap; it does not create v4 records, start services, call models, run browsers, publish, or make a release decision.
