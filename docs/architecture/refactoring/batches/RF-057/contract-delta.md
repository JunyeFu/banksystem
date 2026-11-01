---
id: DOC-ARCH-RF057-CONTRACT
title: RF-057 test contract delta
document_type: reference
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# Test contract

No bank HTTP or migration change. New test suite and machine-readable report supersede the Flowise-derived Full18 release-count requirement for current-product verification; keep historical scripts and evidence. Agent model calls remain real and minimal. Case reports include ID, evidence class, assertions, outcome, run/source identity and duration, with no auth data. An incomplete suite cannot return GO.

## Approved A01 repairs

The user approved source repairs with “落盘修复”. Three contract slots are used: the existing v4 identity manifest; bank adapter authentication v2 (`fuxing-bank-demo@2.0.0`, hash-bound PKCE steps and explicit credential/navigation origins); and Quality OpenAPI 3.0.0. Quality GET `/api/quality/v1/cases` now returns `{items,nextCursor,hasMore}` rather than an array. `limit` is 1–100 (default 20); `q` and `status` filter the whole ledger; keep filters unchanged while following an opaque cursor. Ordering is updated time descending, case ID ascending. Pages remain within L1; omitted rows remain reachable through the cursor, not silently discarded. Invalid parameters return 400. The frontend and generated types are upgraded together; no legacy-array fallback or write API is added.

The Worker code-set manifest includes the shared authentication source, compiled JSON and helper (28 governed files). Adapter v1 and old frozen TargetProfiles are not upgraded by editing live SQLite. The next authorized public authoring flow must prepare/freeze a v2 profile. New source cannot consume the earlier identity's A01 authorization.
