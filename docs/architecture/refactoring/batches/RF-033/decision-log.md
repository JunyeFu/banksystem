---
id: DOC-ARCH-RF033-DECISIONS
title: RF-033 Decision Log
document_type: record
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-033 Decision Log

- 2026-09-03: Reuse the owner-confirmed VQ-03 and implemented Customer Portal style; generate no replacement design.
- 2026-09-03: Navigate to the authoritative result only after the explicit confirmation response succeeds.
- 2026-09-03: Keep Operations correlation proof and the root lifecycle command outside this one-module batch.
- 2026-09-03: Fresh campaigns override the stale machine-specific Fineract hostname with the stable `fineract-server` alias and use the fresh Core bootstrap credential only inside the isolated campaign.
- 2026-09-03: Use SPA navigation after password login because a full reload intentionally discards the in-memory access token.
- 2026-09-03: Do not retain a Playwright trace that may contain authorization material; require a redaction verifier before Full18 trace evidence.
