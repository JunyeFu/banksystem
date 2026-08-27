---
id: DOC-ARCH-RF023-TARGET
title: RF-023 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-023 Target Design

The headless CLI owns command and event projection only. `production-service.mjs` resolves explicit namespace/journey configuration, verifies Flowise absence, creates an encrypted session, reconstructs Controller v2 over the same DPAPI store, and delegates reads/mutations to the independent authenticated loopback MCP adapter. Pending approval identity is stored only inside DPAPI ciphertext; restart reconstructs the graph and executes one exact mutation. Evidence and credential commands remain unavailable until their dedicated adapters exist. No Flowise client, graph or write route is part of the normal profile.

