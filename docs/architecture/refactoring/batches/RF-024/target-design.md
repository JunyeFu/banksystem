---
id: DOC-ARCH-RF024-TARGET
title: RF-024 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-024 Target Design

S1 completes `bootstrap -> hydrate`: a temporary session binding exists only inside DPAPI, proposal arguments are encrypted, and `journey_prepare` is invoked through the same MCP policy/idempotency adapter used by Controller mutations. Harness supplies the only authoritative Journey id. Rebinding is a one-time pre-checkpoint transition; afterwards ordinary namespace/thread/journey/release security applies. S2 will bind the configured model identity, manage only Harness/MCP/Worker, prove public readback, and execute L1 variants in fixed order with no retry after the first deterministic failure.

