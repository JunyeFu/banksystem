---
id: DOC-ARCH-RF030-DECISIONS
title: RF-030 Decision Log
document_type: record
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Decision Log

- 2026-09-03: Treat A02 REVIEW as the repository's completed-implementation handoff state and open A03-M01 under the user's standing instruction to advance on continue prompts.
- 2026-09-03: Use Fineract external IDs as the idempotency key for synthetic business entities; do not use Channel rows as a substitute for core lookup.
- 2026-09-03: Split A03 into sequential RF batches. RF-030 owns only seed and identity mapping; transfer execution and portals remain later batches.
- 2026-09-03: The first Java 21 full-suite run exposed a pre-existing assertion that equated the outbox event ID with the transfer ID even though production deliberately generates a distinct event UUID. Correct only that matcher while preserving the transfer and aggregate ID assertions; no payment behavior changes.
- 2026-09-03: Independent-project integration proved the hard-coded core container name unresolvable while the `fineract-server` service alias is healthy. Replace the single default with that stable alias; do not add a fallback host.
- 2026-09-03: Fresh Fineract has no optional business-date row and the seed principal cannot initialize one. Account creation and initial deposit use an explicit current transaction date; no fallback or hidden retry is added.
- 2026-09-03: Integration exposed the legacy unique constraint on `fineract_client_id`, which prevented a fixture subject and authenticated subject from naming the same customer. Add v9 to make `customer_identity` many-to-one while keeping `subject` as the sole identity key.
- 2026-09-03: Close RF-030 only after 46/46 tests, contract and governance validation, consecutive/restart seed reuse, exact balance readback, and restart-stable identity mapping pass in fresh isolated services.
