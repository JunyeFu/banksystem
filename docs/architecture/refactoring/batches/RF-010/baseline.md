---
id: DOC-ARCH-RF010-BASELINE
title: RF-010 Controller Contract Baseline
document_type: evidence
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-010 Controller Contract Baseline

| Fact | Value |
|---|---|
| Git | `main` / `9d79b7c1e6cfedd995093cc7a378dc8e9218fa98` |
| Dirty file-level records | 229, exclusively routed by the current TP-00 inventory |
| ReleaseIdentity / ledger | `02ae6b18...dc4` / `0/18` |
| MCP contract | `contracts/mcp/hengzhun-i8.json`, 33 ACTIVE tools |
| Existing controller module | none outside Flowise and the isolated RF-009 experiment |
| Runtime/publication | not used by RF-010 |

The contract currently records tool names, status and output level but no mutability annotation. RF-010 therefore adds a separate versioned controller policy rather than inferring mutability from suffixes at runtime.
