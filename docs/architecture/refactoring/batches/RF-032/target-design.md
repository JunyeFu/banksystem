---
id: DOC-ARCH-RF032-TARGET
title: RF-032 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-032 Target Design

```text
shared client create(key, correlation) -> transfer order
shared client confirm(transfer) -> subject-scoped Channel processor -> Fineract
shared client get(transfer) <- customer read model
```

This batch exposes the exact API/client behavior. Customer page wiring and visual verification are assigned to RF-033.
