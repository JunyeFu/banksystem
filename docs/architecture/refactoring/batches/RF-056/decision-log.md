---
id: DOC-ARCH-RF056-DECISION-LOG
title: RF-056 decision log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 decisions

- Separate Docker host recovery and service restart policy (`OPS-DOCKER-001`) from bank-source refactoring (`RF-056`).
- Retain Docker AI and all existing volumes.
- Use five capability ports, business repositories, and no compatibility wrapper around the old adapter.
- Change only document-status PATCH shape; preserve all money-path semantics.
- Complete source and bank gates before freezing Agent ReleaseIdentity.
- The S1 audience boundary exposed the golden API runner's per-run public password clients. Its first post-change seed request returned 401. Use one provisioned confidential synthetic runner client per realm with explicit audience and fixed azp; do not reopen password grant on `customer-portal` or accept wildcard client IDs.
