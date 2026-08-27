---
id: DOC-ARCH-RF006-VERIFY
title: RF-006 Verification Plan
document_type: test_plan
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Verification Plan

1. Feature tests freeze current acceptance outcomes and failure-closed behavior.
2. Unit tests cover change classification, exact reuse predicates and invalidation.
3. Integration tests prove a repeated unchanged thin chain does not author twice.
4. Polling tests prove terminal stop, timeout, backoff and bounded request counts.
5. Timing tests prove every stage has a duration and totals reconcile.
6. One real L1 thin chain is executed only after RF-007 runtime alignment; RF-006 alone cannot claim LIVE acceptance.

No old 18/18 evidence is promoted or discarded in this batch.

Completion: all six checks passed. The focused legacy/selective L1 comparison is recorded in `evidence/acceptance-mode-comparison-s3-2026-08-04.json`; the official current ledger remained `1/18`.
