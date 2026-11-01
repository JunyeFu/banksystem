---
id: DOC-ARCH-RF034-EVIDENCE
title: RF-034 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-034 Evidence Index

## Baseline

RF-034 begins without Fresh Operations correlation browser evidence.

## Closure (2026-09-03)

- Operations Console production build passes; stable locators were added without changing the accepted layout or public contract.
- Fresh Chromium completed OIDC PKCE login with an ephemeral synthetic `PAYMENT_OPERATOR`, searched the exact customer correlation and received exactly one result.
- The read-only detail displayed `SETTLED`, `100.00 CNY`, the exact correlation, a non-empty core reference and non-empty state history.
- Channel authority contained one exact correlation row, one settled row and two ledger entries joined by that correlation; observed Bank Channel error-log hits were zero.
- Screenshot was visually inspected against confirmed VQ-04 and preserves the dark sidebar, red active payment item, white content cards, summary/evidence grid and status timeline.
- Screenshot: `agent/runs/rf034/20260903-170000/operations-transfer-detail.png`, SHA-256 `bbe35068976378d3beb681b5bded1914afe2ed9628bbdfb8dfa68b3148a59e4f`.
- Sanitized result: `agent/runs/rf034/20260903-170000/integration-result.json`, SHA-256 `1f672f0f1fa0ead5845fe88ffdef311fad0d7ea8a5641c168676ce6d202f5f00`.
- No authentication-bearing trace is retained and no credential is present in evidence.
- All exact RF-034 containers, named volumes and networks were removed; original project resources were not modified.

RF-034 S1 and RF-034 are closed. This proves Operations BROWSER_INTEGRATION only; root golden-path, LIVE_E2E, Full18 and release remain unproven.
