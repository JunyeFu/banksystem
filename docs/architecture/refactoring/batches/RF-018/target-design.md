---
id: DOC-ARCH-RF018-TARGET
title: RF-018 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-018 Target Design

Provide an OpenAI-compatible tool-free JSON invoker and an authenticated exact-loopback MCP client. A typed broker canonicalizes MCP text/structured results, enforces timeout and cancellation, never retries mutation, binds argument hash/version/idempotency fences, rejects duplicates, and exposes deterministic `readJourney`, `prefetch`, and `invoke` ports to Controller v2.
