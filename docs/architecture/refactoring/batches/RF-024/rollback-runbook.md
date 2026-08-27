---
id: DOC-ARCH-RF024-ROLLBACK
title: RF-024 Rollback Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-024 Rollback Runbook

For S1, restore only the bootstrap/rebind sources, tests and RF-024 governance paths; do not delete formal sessions or `.data`. For S2, stop only process records whose executable, entrypoint, identity fingerprint and PID all match the normal profile. Preserve pre-existing healthy owned services unless the authorization explicitly requests a reload. Flowise cold rollback remains a separate exact authorization and its evidence cannot close RF-024.

