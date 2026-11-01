---
id: DOC-ARCH-RF050-DECISIONS
title: RF-050 decision log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-050 decision log

1. Scope keys remain human-inspectable because their maximum contracted size is below the widened 512-character column.
2. Risk remains deterministic and database-local; no new policy abstraction is introduced.
3. `CONFIRMED` means Fineract readback matched the reversal transfer; POST response alone is insufficient.
4. The first existing-state migration failed on a removed legacy `transfer` table reference. That statement was removed; the same retained database then migrated successfully without data deletion.
