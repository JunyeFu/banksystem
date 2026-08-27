---
id: DOC-ARCH-RF008-TARGET
title: RF-008 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-008 Target Design

Introduce a cross-document temporal validator with a small, explicit lifecycle:

```text
DRAFT -> PROPOSED -> APPROVED -> IMPLEMENTING -> VERIFYING -> CLOSED
                                  \-> ROLLED_BACK | BLOCKED | ABORTED
```

Rules:

1. A task package cannot be `COMPLETED` while its slice is `PROPOSED`.
2. A batch cannot be `CLOSED` unless required slices are terminal and evidence index contains commands/results.
3. Backlog `DONE` requires batch `CLOSED`; acceptance prose must not claim a prior active state as current.
4. Historical statements carry an explicit date or `historical` marker and never override current status.
5. Runtime acceptance requires ReleaseIdentity and LIVE_E2E ledger predicates; document synchronization cannot manufacture it.
6. Contradictions return file, field, observed status and expected relation.

RF-008 normalizes stale current projections while preserving historical decision/evidence content.
