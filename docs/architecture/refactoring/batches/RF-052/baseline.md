---
id: DOC-ARCH-RF052-BASELINE
title: RF-052 baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 baseline

RF-051 is in REVIEW. Audit append read the last hash without serialization, hashed only six mutable fields, swallowed lookup failures as `null`, and replaced serialization failures with `{}`. Outbox publishers selected the same pending rows before publishing, marked exhausted events as `PUBLISHED`, and sent neither the contractual event envelope nor a consumer deduplication key.
