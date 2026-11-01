---
id: DOC-ARCH-RF030-TARGET
title: RF-030 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Target Design

```text
logical fixture -> stable external ID -> Fineract GET
                                      -> missing: Fineract POST once
stable fixture subject -> customer_identity <- authenticated Keycloak subject
```

Fineract remains authoritative for client, account lifecycle, balance and funding. PostgreSQL stores only the channel-owned identity mapping.
