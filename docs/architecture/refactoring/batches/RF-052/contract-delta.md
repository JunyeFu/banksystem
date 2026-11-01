---
id: DOC-ARCH-RF052-CONTRACT
title: RF-052 contract delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 contract delta

- JMS destinations now use the AsyncAPI address `bank.<eventType>`.
- Published JSON includes authoritative `eventId`, `eventType` and `occurredAt`; JMS properties also carry event ID, type and aggregate ID.
- Outbox status adds the internal states `PROCESSING` and `DEAD_LETTERED`.
- The public audit verification response shape is unchanged and verifies both legacy version 1 and complete-record version 2 rows.
