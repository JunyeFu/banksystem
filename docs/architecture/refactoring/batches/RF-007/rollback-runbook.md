---
id: DOC-ARCH-RF007-ROLLBACK
title: RF-007 Rollback Runbook
document_type: runbook
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Rollback Runbook

Stop managed services, restore the previous code and identity schema, restart through managed lifecycle and verify the previous inspector state. Do not relabel new identity evidence as old evidence. If public publication changed, republish the recorded rollback flow through the public API and read it back.

RF-007 completed without invoking rollback. This runbook remains the accepted recovery procedure for WorkerCodeSet mismatch, managed reload failure, publication drift or L1 regression.
