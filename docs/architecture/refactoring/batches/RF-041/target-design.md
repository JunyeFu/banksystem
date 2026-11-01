---
id: DOC-ARCH-RF041-TARGET
title: RF-041 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-041 Target Design

Session start first creates the encrypted local controller envelope, then creates an idempotent HELP/NONE Journey through the existing MCP contract and binds the returned Journey ID. On failure the incomplete local envelope is archived. Status and resume validate the local identity binding but display only the Journey returned by Harness for the exact sessionRef.
