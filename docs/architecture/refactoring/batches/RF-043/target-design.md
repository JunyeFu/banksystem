---
id: DOC-ARCH-RF043-TARGET
title: RF-043 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-043 Target Design

The controller invokes the bound model once with a strict candidate schema and no tools. Deterministic code supplies provenance and fixed execution/evidence strategies, then the CLI performs one `journey_prepare` MCP mutation. The returned Harness projection supplies the only accepted version, status, proposal and candidate summary. Validate is one `journey_get` read.
