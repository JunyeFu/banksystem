---
id: DOC-ARCH-RF052-EVIDENCE
title: RF-052 audit and event delivery evidence
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-052 audit and event delivery evidence

## Result

RF-052 implementation is deployed to the retained local demo topology and is in REVIEW/observation. No ReleaseIdentity was frozen and no Full18 or release GO is claimed.

## Verification

| Gate | Result |
|---|---|
| Java 21 | PASS, 71/71; includes AsyncAPI destination, envelope fields and JMS event ID property |
| PostgreSQL audit integration | PASS; 24 concurrent appends form one chain, modified metadata identifies the first broken event, unserializable metadata writes nothing |
| Outbox integration | PASS; two publishers deliver 20 events once each, fifth failure becomes `DEAD_LETTERED`, Inbox rejects a repeated event ID for the same consumer and accepts it for another consumer |
| Liquibase v14 retained-state migration | PASS; two changesets, audit hash version plus Outbox claim owner/time columns |
| Retained audit verification | PASS; 75 events verified, 57 version 1 rows and 18 version 2 rows form one chain, last hash `cb32c86fe9c79e0bca2ad58027a1852a9180824c42c5930cdc6f61b4e6e4e72c` |
| Retained broker delivery | PASS; final six events published to `bank.transfer.status.changed`; 60 Outbox rows are `PUBLISHED`, zero dead letters |
| Existing bank golden path | PASS; correlation `bank-transfer-golden-856f4f1f498c46d289421c2f12df0338`, Fineract transaction `10`, amount CNY 100.00 |
| Keepalive | PASS; managed containers remain running; only Bank Channel was replaced |

## Boundary

The broker path is validated with an isolated JmsTemplate contract and the retained ActiveMQ connection used by the deployed publisher. There is no product JMS consumer yet; the shared Inbox claim is the enforced deduplication primitive for future consumers. RF-052 does not freeze a new ReleaseIdentity or establish LIVE_E2E release evidence.
