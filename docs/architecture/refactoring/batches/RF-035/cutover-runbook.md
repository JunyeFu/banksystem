---
id: DOC-ARCH-RF035-CUTOVER
title: RF-035 Cutover Runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Cutover

Start the prepared product, require `demo.ps1 status` to report READY, then run `demo.ps1 run-golden-path`. Accept only exit 0 and canonical JSON with `status=COMPLETED`. Any other exit stops the gate; do not retry under the same release evidence claim.
