---
id: DOC-ARCH-RF055-CUTOVER
title: RF-055 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-055 cutover runbook

Build the Bank Channel image, replace only Bank Channel, Test Support and Gateway, provision fixed identities, run the two-cycle lifecycle and login checks, then leave all managed services running. Do not reset retained volumes during cutover.
