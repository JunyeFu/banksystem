---
id: DOC-ARCH-RF031-TARGET
title: RF-031 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-031 Target Design

```text
request(Idempotency-Key, X-Correlation-Id, amount)
  -> transfer_order(key, correlation)
  -> processor -> Fineract account transfer(key) -> transaction reference
  -> transfer_order(core reference, SETTLED)
  -> ledger debit + credit(correlation)
  -> customer and operations read models
```

Fineract alone decides balances and transaction outcome. Channel state is a correlated projection and never substitutes for core readback.
