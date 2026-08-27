---
id: DOC-ARCH-RF016-TARGET
title: RF-016 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-016 Target Design

The product root owns the exact MCP SDK lock. MCP v2 exposes 35 tools: 13 pure reads and 22 explicit mutations. `candidate_compile` owns compile, `result_inbox_ack` owns acknowledgement, preview never grants downloads, and attachment ingestion uses canonical `attachmentRef` receipts from Harness.
