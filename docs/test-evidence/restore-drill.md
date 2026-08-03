---
id: DOC-EVIDENCE-RESTORE-DRILL-20260710
title: 核心库恢复演练证据（2026-07-10）
document_type: evidence
domain: infrastructure
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-10
owner: project-owner
---

# Core restore drill evidence

Run date: 2026-07-10. `restore-core-drill.ps1` created a temporary PostgreSQL
18.3 container, created the backup owner role, restored
`fineract_default.dump`, and verified 285 public tables. The temporary container
was removed in a `finally` block. The live Fineract PostgreSQL container and its
bind-mounted data directory were not stopped or mounted.
