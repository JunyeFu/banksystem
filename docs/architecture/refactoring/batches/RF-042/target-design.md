---
id: DOC-ARCH-RF042-TARGET
title: RF-042 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-042 Target Design

`probeConfiguredModel` validates the three-variable binding, derives one `/chat/completions` endpoint from the configured API base, hashes the normalized base, and sends one deterministic request without tools or streaming. Doctor consumes this result before probing any local service.
