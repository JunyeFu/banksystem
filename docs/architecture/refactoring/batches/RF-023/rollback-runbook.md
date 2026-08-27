---
id: DOC-ARCH-RF023-ROLLBACK
title: RF-023 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-023 Rollback Runbook

Restore only RF-023 CLI composition, SBOM generator/output, lifecycle extension, test registration and governance paths to the recorded RF-022 baseline. Do not delete user session roots, touch `.data`, alter managed processes or invoke the cold Flowise implementation. Any future cold rollback requires an exact release identity authorization distinct from normal lifecycle authorization.

