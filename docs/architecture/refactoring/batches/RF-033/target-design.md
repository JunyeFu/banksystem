---
id: DOC-ARCH-RF033-TARGET
title: RF-033 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-033 Target Design

```text
customer form -> create(idempotencyKey, correlationId) -> verification page
verification click -> confirm(transferId) -> settled transfer result
result -> status + correlationId + coreReference + receipt action
```

All browser calls remain same-origin Gateway calls through the shared client. No automatic confirmation, retry or alternative processor is introduced.
