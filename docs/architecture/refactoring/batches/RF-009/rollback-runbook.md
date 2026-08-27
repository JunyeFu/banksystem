---
id: DOC-ARCH-RF009-ROLLBACK
title: RF-009 Rollback Runbook
document_type: runbook
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Rollback Runbook

1. Stop only the PoC command if it is running; RF-009 starts no managed service.
2. Preserve failing test output in the evidence index without secret-bearing content.
3. Remove only `platform/hengzhun-regression-system/experiments/agent-controller-ag00` if the user later authorizes rollback.
4. Revert only RF-009 governance projections through a history-preserving change.
5. Recompute ReleaseIdentity and the TP-00 inventory; both product identity and pre-existing user files must remain intact.

No automatic deletion is performed by the PoC or its tests.
