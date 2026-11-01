---
id: DOC-ARCH-RF036-EVIDENCE
title: RF-036 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-036 Evidence Index

## Closure (2026-09-03)

- Customer Portal production image built successfully.
- Fresh Chromium submitted the password login form and reached `/portal/dashboard` with the synthetic `CUSTOMER` identity.
- Dashboard showed `演示 客户`, one account, `100,000.00 CNY`, `****0001` and normalized status `正常`; Fineract authority reported balance `100000`.
- Login and overview screenshots were visually checked against confirmed VQ-02.
- Temporary customer/operator identities, clients, browser session data and non-fixture subject mappings were removed. No authentication trace was retained.
- Sanitized machine result: `agent/runs/rf036/20260903-172100/integration-result.json`, SHA-256 `9d4084a930985ea77b91e73278214b4ff60efefe3189ce53616190be59a41660`.
