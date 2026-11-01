---
id: DOC-ARCH-RF042-DECISIONS
title: RF-042 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-042 Decisions

- Keep the existing OpenAI-compatible chat-completions protocol as the only model transport.
- Hash the normalized API base and never emit the API key or raw Base URL.
- Make one request and surface its first failure without retry or fallback.
- Keep Journey authoring outside RF-042.
