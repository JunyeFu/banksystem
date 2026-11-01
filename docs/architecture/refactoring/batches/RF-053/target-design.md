---
id: DOC-ARCH-RF053-TARGET
title: RF-053 target design
document_type: target-design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-053 target design

Customer projections reject missing core money, date, identity, currency, and unknown transaction types. Transaction direction is mapped from explicit Fineract semantics; currency comes from the owning account when transaction rows omit it. Statements use deterministic date and transaction ordering plus the latest core running balance.

Only named savings actions are callable. Core posting dates use configured Fineract business date, or the same core response's HTTP date when this Fineract deployment explicitly reports that no business date is configured. Beneficiary equality is a server-side domain-separated HMAC and existing rows migrate on use.
