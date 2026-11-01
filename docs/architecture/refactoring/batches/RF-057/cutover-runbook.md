---
id: DOC-ARCH-RF057-CUTOVER
title: RF-057 suite cutover
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# Cutover

Build the new manifest and runners, verify tool contracts, execute real bank cases, then real Agent and load profiles. Only after required results exist change current-product verification references. Keep legacy Full18 as historical evidence, not an additional release requirement. No down/reset, Docker AI changes or core date changes. Stop new writes immediately on a deterministic business invariant failure; only readback and scoped identity cleanup continue. Expected 409 in concurrency tests is success behavior, not an unexpected execution failure.
