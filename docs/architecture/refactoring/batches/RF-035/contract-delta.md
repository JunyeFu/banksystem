---
id: DOC-ARCH-RF035-CONTRACT
title: RF-035 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Contract Delta

The local/test-only Test Support API adds `DELETE /identities/{subject}`. It rejects stable `fixture-*` subjects and removes at most one temporary Keycloak subject mapping. No customer or operations public API changed. Root success output is the canonical seven-field golden journey JSON plus status `COMPLETED`.
