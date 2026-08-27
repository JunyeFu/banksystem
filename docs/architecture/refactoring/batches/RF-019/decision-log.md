---
id: DOC-ARCH-RF019-DECISIONS
title: RF-019 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-019 Decision Log

- Use exact `@primno/dpapi@2.0.1`, prebuilt N-API x64/arm64, with only `CurrentUser` scope.
- Decryption, digest, schema or identity failure is terminal and never falls back to a new session.
- Default retention is 30 days; proposal approval remains 5 minutes from risk policy.
- Fork copies bounded history only and clears checkpoint and pending proposal state.
- 2026-08-26: RF-019 closed after Node 20/24 session matrices, 75-test controller regression, 521-test registered product regression, zero-vulnerability production dependency audit and governance validation. Formal data, runtime activation and publication remain out of scope.
