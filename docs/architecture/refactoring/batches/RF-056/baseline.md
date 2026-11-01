---
id: DOC-ARCH-RF056-BASELINE
title: RF-056 baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 baseline

RC-G0: `main@552b3b8ac517bd5991bff446e72d9f4e87ea9543`, inherited dirty tree (322 status entries at entry) retained. RF-055 remains REVIEW. Current Channel Compose lacked a restart policy; OPS-DOCKER-001 is separately owned. The old Agent source identity is stale and cannot count as this batch's LIVE evidence. Existing Fineract, Channel, Keycloak, and Docker volumes are recovery points, not cleanup targets.

Observed code boundaries: issuer-only JWT decoding; customer password grant and in-memory token; Statement-to-CustomerController call; one large mixed-transport FineractAdapter; 26 direct SQL owners; status PATCH without expected version. Exact target files are discovered per slice before edits, and preexisting changes are preserved.
