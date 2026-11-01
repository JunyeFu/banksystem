---
id: DOC-ARCH-RF057-TARGET
title: RF-057 target design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# Design

BANK-AGENT-ACCEPTANCE-v1 tests actual portals (18082/18083), Gateway (18443), Keycloak (19000), Fineract (13000), CLI, MCP (18789), Harness/quality (18788), Worker and browser. No stage8 controlled portal, response interception or runtime model substitute. Public APIs provide assertions; only Fineract APIs supply balances and transaction facts. Isolated synthetic identities use existing Test Support; accounting history is retained. Role separation, decimal money, correlation and idempotency are asserted.

S1 bank functional/business; S2 real BYOK Agent; S3 bounded load/stress/soak; S4 suite aggregation. Neither a request success nor a screenshot alone proves settlement. Missing capability remains failed/not-run, never removed from the manifest to obtain PASS.
