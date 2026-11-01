---
id: DOC-ARCH-RF046-TARGET
title: RF-046 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-06
owner: Codex
---
# RF-046 Target Design

The formal Worker captures a bounded redacted DOM structure, the existing quarantined screenshot, a Playwright trace without sources, a request/response record containing no query, headers or bodies, and an execution ledger containing only immutable IDs and evidence digests. Harness registers each artifact, resolves the exact Journey to its Run and Task, re-reads stored bytes, verifies SHA-256 and size against SQLite metadata, and returns one bounded verification view. MCP exposes that view through one read-only governed tool. `hz-agent evidence verify <journeyId> --jsonl` succeeds only for a terminal current-identity Journey with every required evidence kind verified. No path, download URL, token, credential or page value reaches CLI output.
