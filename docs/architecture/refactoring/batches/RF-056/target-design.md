---
id: DOC-ARCH-RF056-TARGET-DESIGN
title: RF-056 target design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 target design

Bank API tokens carry `aud=bank-channel-service`; customer and internal realms have distinct allowed `azp` sets. The customer browser performs authorization-code + PKCE, and a reload reauthorizes through the existing Keycloak session. A customer identity query service serves both Customer and Statement endpoints.

Fineract calls use Customer, Account, Transfer, Loan, and Core Operations ports with business return types, backed by one controlled HTTP transport. Channel SQL lives in business repositories; application services retain transaction and lock orchestration. Documents update only `DRAFT -> PUBLISHED -> ARCHIVED` with a required expected version. A small architecture test forbids Controller-to-Controller and Controller/application-Service SQL access.
