---
id: DOC-ARCH-RF052-DECISIONS
title: RF-052 decision log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 decision log

- PostgreSQL owns audit append serialization; no process-local mutex is used.
- Hash versioning preserves historical evidence instead of rewriting old hashes.
- Outbox claim ownership is stored on the event; a five-minute expired claim is eligible for another publisher.
- Inbox uniqueness remains `(consumer_name,event_id)` so different projections may each consume one event exactly once.
- No broker fallback or log-only delivery path exists.
