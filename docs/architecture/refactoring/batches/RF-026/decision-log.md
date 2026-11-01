---
id: DOC-ARCH-RF026-DECISIONS
title: RF-026 Decision Log
document_type: decision
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-026 Decision Log

- 2026-08-30: Windows 11 + Docker Desktop is the v1 delivery environment.
- 2026-08-30: The model contract is one user-provided OpenAI-compatible endpoint with no runtime fallback.
- 2026-08-30: Flowise is historical evidence only and is absent from product startup, recovery, CI and release gates.
- 2026-08-30: Quality Portal is a read-only Harness projection and cannot become a second writer.
- 2026-08-30: Speculative retries, fallbacks and compatibility paths are rejected; banking, authentication, idempotency, credential and evidence integrity controls remain mandatory.
