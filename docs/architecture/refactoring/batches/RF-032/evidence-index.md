---
id: DOC-ARCH-RF032-EVIDENCE
title: RF-032 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-032 Evidence Index

## Baseline

RF-032 begins with RF-031 API evidence. It owns the customer confirmation API and shared client only; customer-page wiring, browser proof and the root golden-path command are assigned to later batches.

## Closure (2026-09-03)

- Bank Channel Java 21 suite: `53/53`, failures `0`, errors `0`, skipped `0`.
- Shared bank API client: `15/15`.
- Subject-scoped customer confirmation invokes the existing idempotent processor and rejects a foreign subject as not found.
- Fresh isolated integration used six new named volumes and no Flowise service. The customer confirmation endpoint settled exactly one synthetic `100.00 CNY` transfer.
- Fineract balances changed from `100000.00 / 50000.00` to `99900.00 / 50100.00`; the combined `150000.00 CNY` balance was conserved, and terminal replay did not change either balance.
- Channel state contains one settled transfer, two balanced correlation-bearing ledger entries and one SHA-256-bearing receipt; Bank Channel emitted no error/exception/failure log entry during the observed campaign.
- Sanitized evidence: `agent/runs/rf032/20260903-162100/integration-result.json`, SHA-256 `683221e7224f317a815e9ae7ed3f1dc73f853e0a46f17824d2cb7167bfe5a611`.
- All exact RF-032 containers, named volumes and networks were removed after capture; original project resources were not modified.

RF-032 S1/S2 and RF-032 are closed. This proves the confirmation API and shared-client INTEGRATION only; portal wiring, browser evidence, LIVE_E2E, Full18 and release remain unproven.
