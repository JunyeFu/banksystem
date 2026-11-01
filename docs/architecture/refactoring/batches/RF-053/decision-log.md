---
id: DOC-ARCH-RF053-DECISIONS
title: RF-053 decision log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-053 decision log

- Missing or invalid core money, dates, identity, currency, and types fail the read request.
- Fineract transaction rows inherit currency only from their owning core account.
- Fineract deployments returning 400, 404, or 405 for transaction collection use the official account transaction association; other errors propagate.
- Fineract HTTP date is accepted as posting date only when the core explicitly reports no configured business date.
- Beneficiary deduplication uses a domain-separated HMAC with the existing server-only callback secret.
- Statement-to-customer-controller coupling is left for the scheduled RF-056 boundary batch.
