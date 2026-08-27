---
id: DOC-ARCH-RF024-CONTRACT
title: RF-024 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-024 Contract Delta

A fresh CLI run no longer requires a pre-existing Journey environment variable. It creates an encrypted temporary Journey binding and returns a deterministic LOW-risk `journey_prepare` proposal without an MCP write. Exact approval invokes that frozen proposal once, atomically rebinds the same session to the authoritative Harness Journey before any LangGraph checkpoint, then enters Controller v2. An optional configured Journey remains supported for controlled resume and compatibility.

Credential enrollment is not a Journey. It uses a separately typed, DPAPI-encrypted operation envelope and an `operation-*` resume identifier. The initial command freezes a HIGH `credential_session_create` proposal without writing MCP. Exact approval executes it once; the returned loopback capture URL is transient launcher input and is never persisted or emitted through JSONL.
