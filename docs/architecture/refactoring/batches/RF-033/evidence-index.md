---
id: DOC-ARCH-RF033-EVIDENCE
title: RF-033 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-033 Evidence Index

## Baseline

RF-033 begins with RF-032 API/client evidence and no Customer Portal browser transfer.

## Closure (2026-09-03)

- Customer Portal production build passes. The form generates one correlation ID per form instance and sends it independently from the idempotency key.
- Fresh headless Chromium logged in as an ephemeral synthetic customer, used SPA navigation, created one `100.00 CNY` transfer, explicitly confirmed it, and displayed the authoritative `SETTLED` result.
- Browser traffic contained exactly one create `202` and one confirm `200`. The result displayed a non-empty business correlation ID and Fineract transaction reference.
- Fineract balances changed exactly from `100000.00 / 50000.00` to `99900.00 / 50100.00`; combined balance remained `150000.00 CNY`.
- Channel contains one settled transfer, two balanced correlation-linked ledger entries and one SHA-256-bearing receipt; observed Bank Channel error-log hits were zero.
- The final screenshot was visually inspected against confirmed VQ-03 and preserves the implemented red/white header, green success state, two-column result card and three-action footer.
- Screenshot: `agent/runs/rf033/20260903-165000/customer-transfer-result.png`, SHA-256 `fff90826994f1ada174ee5a04b8c49943a78fb4f8704cc87fd6b3c61da8dea4b`.
- Sanitized result: `agent/runs/rf033/20260903-165000/integration-result.json`, SHA-256 `0dc1c3216207c24e2ca1389996f8d312a8c55e8decdbc76446a9a564932076de`.
- Authentication-bearing Playwright traces are not retained. Full18 remains blocked on a trace redaction/verification task; no credential was written to retained RF-033 evidence.
- All exact RF-033 containers, named volumes and networks were removed; original project resources were not modified.

RF-033 S1 and RF-033 are closed. This proves Customer Portal BROWSER_INTEGRATION only; Operations parity, root golden-path, LIVE_E2E, Full18 and release remain unproven.
