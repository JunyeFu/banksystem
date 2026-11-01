---
id: DOC-ARCH-RF056-CUTOVER-RUNBOOK
title: RF-056 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 cutover

Advance S1 through S6 serially. S1 signs the audience before enforcing it. Rebuild and replace only the service whose source changed. Preserve Core, data volumes and all unrelated services; do not run `down` or `reset`. A failed slice remains open and blocks later slices. Freeze a fresh ReleaseIdentity only after all source/contract changes and bank verification; Agent LIVE requires separate exact-identity authorization.
