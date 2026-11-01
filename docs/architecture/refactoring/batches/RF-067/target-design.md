---
id: RF067-TARGET-DESIGN
title: RF-067 Target boundary
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-067 Target boundary

Own only Harness SQLite conversation/message/profile metadata and its MCP producer/consumer contract. Keep stable conversation/turn IDs separate from checkpoint forks. No plaintext key, private reasoning or independent execution truth. Producer and MCP changes are the two permitted modules; CLI integration is owned by RF066, not this batch.

