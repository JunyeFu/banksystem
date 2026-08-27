---
id: DOC-ARCH-RF008-CONTRACT
title: RF-008 Contract Delta
document_type: contract
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-008 Contract Delta

Add a governance-only machine contract for:

- batch lifecycle state;
- slice lifecycle state;
- task-package lifecycle state;
- evidence status (`PLANNED`, `RECORDED`, `CURRENT`, `HISTORICAL`, `SUPERSEDED`);
- `asOf` timestamp and optional `supersededBy` reference.

The validator reads existing YAML/Markdown metadata with compatible defaults, then requires explicit fields when a document is touched. No product, MCP, Harness, Worker, Flowise or database contract changes.
