---
id: DOC-ARCH-RF008-CUTOVER
title: RF-008 Cutover Runbook
document_type: runbook
domain: architecture
status: PROPOSED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-008 Cutover Runbook

1. Freeze contradiction inventory and exact files to normalize.
2. Add the temporal validator and fixtures in warning mode.
3. Correct bounded current projections from authoritative batch/evidence facts.
4. Switch validator to failure mode for touched RF documents.
5. Run all governance/document validators.
6. Record remaining grandfathered contradictions with owners and expiry.

Do not edit runtime evidence bodies or user-owned RF-005 changes.
