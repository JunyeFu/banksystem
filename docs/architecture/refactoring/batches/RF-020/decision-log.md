---
id: DOC-ARCH-RF020-DECISIONS
title: RF-020 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-020 Decision Log

- Headless commands always use JSONL; formatted terminal rendering belongs to TP06.
- `run` requires explicit `--jsonl`; stdin is represented by `--input-file -`.
- Exit 20 means an exact proposal is pending and no write occurred; there is no auto-approval path.
- Application logic depends on an injected service port. TP07 owns production composition and lifecycle.
- 2026-08-26: RF-020 closed after the 11-test Node 24 matrix, executable exit-code smoke, 522-test registered regression and governance validation. Runtime remains deliberately unbound.
