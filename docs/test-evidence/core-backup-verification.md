---
id: DOC-TEST-EVIDENCE-CORE-BACKUP-VERIFICATION.MD
title: Core Backup Verification
document_type: evidence
domain: banking
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-10
owner: project-owner
---

# BANK-0004 verified core backup

Created at UTC `2026-07-10T03:50:08.7137626Z` from the running local PostgreSQL
container `mifos-isolated-postgresql-1`. The operation used `pg_dump -Fc` and
validated each archive using `pg_restore -l`; it did not stop PostgreSQL, alter
data, or run a restore.

| Database | Archive | Bytes | SHA-256 | Validation |
|---|---|---:|---|---|
| `fineract_tenants` | `backups/core/20260710T035006Z/fineract_tenants.dump` | 23,947 | `0470037527A8921B514CF90C9E3DF4E534563030727F0093CE3FA5A238245474` | `pg_restore -l` passed |
| `fineract_default` | `backups/core/20260710T035006Z/fineract_default.dump` | 1,243,542 | `3231C44E672BFE78AA6AED3216276BFA3FAF106A6469B1482B3C972FB3AE26D1` | `pg_restore -l` passed |

The companion immutable manifest is `backups/core/20260710T035006Z/manifest.json`.
The root `.gitignore` excludes `backups/`; `git check-ignore` confirmed the
archives and manifest are not eligible for Git staging.

## Restore procedure — do not run without explicit approval

1. Stop the dependent application containers, not the backup archive.
2. Create a fresh PostgreSQL target or a separately approved restore target.
3. Copy the selected archive into that target and run:

```powershell
docker cp .\backups\core\20260710T035006Z\fineract_tenants.dump <postgres-container>:/tmp/fineract_tenants.dump
docker exec <postgres-container> pg_restore -U postgres -d fineract_tenants --clean --if-exists /tmp/fineract_tenants.dump
docker cp .\backups\core\20260710T035006Z\fineract_default.dump <postgres-container>:/tmp/fineract_default.dump
docker exec <postgres-container> pg_restore -U postgres -d fineract_default --clean --if-exists /tmp/fineract_default.dump
```

4. Verify archive SHA-256 before restore, then run Fineract health, tenant, and
balance/audit regression checks. A restore drill belongs to BANK-0602 and has
not been performed in Phase 0.
