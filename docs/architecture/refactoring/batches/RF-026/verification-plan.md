---
id: DOC-ARCH-RF026-VERIFICATION
title: RF-026 Verification Plan
document_type: verification
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-026 Verification Plan

Run from the repository root:

1. `py -3 scripts/architecture/validate_refactoring.py --batch RF-026`
2. `py -3 scripts/architecture/validate_refactoring_temporal.py`
3. `python scripts/docs/validate_docs.py`
4. `git diff --check`

All commands must exit zero. The evidence class is DOC/GOVERNANCE only.
