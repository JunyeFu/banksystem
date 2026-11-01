---
id: DOC-ARCH-RF030-VERIFY
title: RF-030 Verification Plan
document_type: verification
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Verification

STATIC and CONTRACT run the service tests and parse both fixture copies and OpenAPI. INTEGRATION starts the owned topology, seeds twice, compares IDs/actions, restarts Bank Channel and reads the same mapping. No browser, model, LIVE_E2E, Full18 or release result is inferred.
