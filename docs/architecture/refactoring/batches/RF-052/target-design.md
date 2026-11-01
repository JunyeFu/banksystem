---
id: DOC-ARCH-RF052-TARGET
title: RF-052 target design
document_type: target-design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 target design

Audit version 2 takes a PostgreSQL transaction advisory lock, reads one chain tail, hashes every persisted field except the hash itself, and appends in the same transaction. Version 1 rows retain their original verification algorithm. JSON serialization failures abort the write.

Each publisher atomically claims one eligible Outbox row with `FOR UPDATE SKIP LOCKED` and a visible owner lease. It publishes the AsyncAPI envelope to the contractual queue, then transitions only its own claim to `PUBLISHED`, back to `PENDING`, or atomically to `DEAD_LETTERED`. Consumers claim `(consumer_name,event_id)` with `ON CONFLICT DO NOTHING` before applying an event.
