---
id: RF066-ROLLBACK
title: RF-066 rollback boundary
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 rollback boundary

On secret exposure, wrong binding or duplicate execution: stop only the newly owned web task/process; preserve browser operation IDs, Harness authority and original services. Do not resubmit an uncertain bank transaction.

Restore only the exact RF066 edits using per-file baselines recorded before source mutation. Never reset the dirty checkout. Additive transcript records remain for readback; do not delete historical data or run down migrations against retained state. No rollback has been needed or executed in this turn.


