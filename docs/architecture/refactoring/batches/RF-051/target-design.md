---
id: DOC-ARCH-RF051-TARGET
title: RF-051 target design
document_type: target-design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 target design

`EodService` registers the run before work, holds one PostgreSQL advisory lock for the business date, executes external work outside local transactions, and commits one checkpoint after each successful step. Re-entry skips checkpoints. One business date permits one active or completed run; a preserved failed run does not block a new key after operators resolve its differences. An interrupted date advance first reads Fineract: the intended next date is accepted as already completed; any other date blocks. Reconciliation compares each terminal transfer's core identity, accounts, amount and currency, persists field differences, and EOD advances only when both pre-job and post-job results are `MATCHED`.
