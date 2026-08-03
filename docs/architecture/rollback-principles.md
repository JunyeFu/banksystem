---
id: DOC-418D3BC22F
title: Rollback principles
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# Rollback principles

Scope: banking-core Track within the v5.4 external-demo product.
The v5.4 regression-platform rollback boundary is defined by the current [Coze/Harness responsibility baseline](overview/coze-harness-midscene-observability-boundary.md) and must not weaken these banking invariants.
Frozen: 2026-07-11 as part of S0 baseline governance.

## Stage-level rollback

1. A stage that fails its exit conditions MUST NOT proceed to the next stage.
2. A failed stage is rolled back to its last known good state using stage-level backups.
3. Rollback evidence (what was rolled back, why, and to what state) MUST be recorded in `docs/evidence/agent-reports/`.

## Business date rollback

1. If any step of the EOD (End-of-Day) process fails, the business date MUST NOT advance.
2. EOD standard order: lock date -> check pending payments -> channel-to-clearing reconciliation -> channel-to-core reconciliation -> Fineract COB/batch -> interest/fees/overdue -> accounting balance -> audit checkpoint -> advance date.
3. Failure at any step requires fixing the issue and re-running EOD from the failed step.
4. Rolling back the business date requires explicit approval and a recorded reason.

## Money operation rollback

1. A failed money operation MUST NOT be retried unconditionally. It must go through the state machine.
2. A posted transaction that needs reversal MUST move through `SETTLED -> REVERSAL_PENDING -> REVERSED`.
3. The original transaction record MUST NOT be overwritten or deleted.
4. Reversal produces a new transaction record linked to the original via `correlation_id`.
5. Both the original and reversal must have accounting entries and audit records.

## Database rollback

1. Channel database migrations are managed by Liquibase. Rollback uses Liquibase rollback commands.
2. Core Fineract database MUST NOT be rolled back by channel scripts. Core rollback is a separate core-owned procedure.
3. Before rolling back a channel migration, verify that no outbox events are pending publication.
4. After rollback, verify invariants: account balances, transfer states, audit chain integrity.

## Backup and restore

1. Core backup: `scripts/backup/create-core-backup.ps1` -> `backups/` (gitignored).
2. Channel backup: `scripts/backup/create-channel-backup.ps1` -> `backups/` (gitignored).
3. Restore drill: restore to a temporary target, verify invariants, then discard temporary target.
4. Post-restore invariants to verify:
   - Account balances match between channel and core.
   - Customer-to-account mappings are intact.
   - Audit hash chain is unbroken.
   - Transfer orders have consistent state history.
   - Reconciliation reports show zero differences.
5. A restore that only checks table count is INSUFFICIENT. Balance, mapping, audit, order, and reconciliation invariants MUST all pass.

## Configuration rollback

1. All infrastructure configuration changes are version-controlled in Git.
2. Compose file changes require a clean `docker compose down && docker compose up` test.
3. Keycloak realm changes require export verification.
4. `.env` changes require `.env.example` update and notification to all agents.

## Emergency rollback procedure

1. Stop the affected service: `docker compose stop <service>`.
2. Assess: is data integrity at risk? If yes, stop all channel services.
3. Restore from last known good backup (core and/or channel).
4. Verify invariants per "Post-restore invariants" above.
5. Resume services one at a time, verifying health after each.
6. Record the incident in `docs/evidence/` with timeline, root cause, and resolution.
