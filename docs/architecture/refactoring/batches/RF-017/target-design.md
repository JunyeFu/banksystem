---
id: DOC-ARCH-RF017-TARGET
title: RF-017 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-017 Target Design

The inactive v2 graph is `hydrate -> deterministic prefetch -> tool-free JSON plan -> policy transition -> answer/clarify or freeze -> exact approval -> one mutation -> authority readback -> render`. Prefetch and mutation ports are injected; the model receives one bounded JSON envelope and no tools. Strict schemas admit only `ANSWER`, `CLARIFY` or `PROPOSE`. Risk is derived from a complete policy map, never accepted from model output. Proposal content binds namespace, thread, journey, release identity, authority version, tool, immutable argument hash, risk and expiry.
