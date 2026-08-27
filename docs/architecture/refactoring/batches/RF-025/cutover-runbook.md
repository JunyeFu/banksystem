---
id: DOC-ARCH-RF025-CUTOVER
title: RF-025 Cutover Runbook
document_type: runbook
domain: architecture
status: DRAFT
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Cutover Runbook

Cutover is prohibited until TP09 has two current L1 terminal records under one bound v4 identity and the project owner supplies a new TP10 authorization naming that identity and the permitted normal-profile operations. Resume at the first missing ordered chain; after every terminal result require current public readback before ledger admission. Stop on the first deterministic failure. Recheck supply chain and DPAPI restore on the same identity. Execute cold rollback only under a second, explicit authorization. Re-read all gates, produce `ELIGIBLE_FOR_HUMAN_DECISION`, then wait for the project owner's `GO` or `NO_GO`.

The cold authorization is exactly `HENGZHUN_AUTHORIZE_FLOWISE_COLD_ROLLBACK=<bound identity>` and must not reuse the normal LIVE variable. After the immutable cold record and final readback produce eligibility, the decision command additionally requires `HENGZHUN_PROJECT_OWNER_RELEASE_DECISION=<GO|NO_GO>:<bound identity>`. Never set either variable from a machine-derived recommendation.
