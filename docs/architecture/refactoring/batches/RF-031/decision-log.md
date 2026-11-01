---
id: DOC-ARCH-RF031-DECISIONS
title: RF-031 Decision Log
document_type: record
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-031 Decision Log

- 2026-09-03: Open RF-031 only after RF-030 closes; keep portal and root lifecycle work outside this batch.
- 2026-09-03: Require a caller-supplied business correlation ID; do not synthesize one from MDC or reuse the idempotency key.
- 2026-09-03: Use an explicit current transfer date because Fresh Fineract has no optional business-date row; do not add a fallback lookup.
- 2026-09-03: The first integration core call succeeded but the Channel transaction rolled back because the historical receipt table lacks the three columns already required by Processor and Receipt API. Add v10 for subject, payload and SHA-256, then prove same-key recovery before restarting the formal campaign.
- 2026-09-03: Close only after a new empty-volume formal campaign passes duplicate create/process, exact two-account balance deltas, total conservation, balanced ledger projection and both authenticated read models.
