---
id: DOC-ARCH-RF047-VERIFICATION-PLAN
title: RF-047 verification-plan
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-08
owner: Codex
---
# RF-047 verification-plan

S1: build, typecheck, agent-l1-live.test.cjs, registered tests, RF-047 and docs validators. Tests use injected CLI output and temporary synthetic files; no external model or managed runtime. Prove response-only failure, missing/tampered/cross-identity evidence failure, ordered variants, old checkpoint rejection and input drift rejection. S2/S3 require separate LIVE authorization.

Offline evidence runner: `agent/runs/rf047/validate-offline.cjs`. It records public CLI identity before/after, registered TAP counts, and hash-only snapshots of the managed-process checkpoint, L1 checkpoint and Full18 ledger. A changed snapshot or identity fails the run. The original result and the final post-review result are retained separately.
