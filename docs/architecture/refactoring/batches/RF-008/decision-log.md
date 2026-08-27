---
id: DOC-ARCH-RF008-DECISIONS
title: RF-008 Decision Log
document_type: decision
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-008 Decision Log

1. 2026-08-03: user approved control-chain creation only.
2. Time conflicts are corrected in current projections, not by rewriting historical evidence.
3. RF-008 executes after RF-007 so current runtime and reuse decisions exist before final status synchronization.
4. Existing user edits remain outside scope until specifically authorized.
5. Implementation requires separate task-package approval.
6. 2026-08-04: project owner approved RF-008-S1 only. S2 normalization/fixtures and S3 enforcement remain unapproved.
7. S1 introduces `validate_refactoring_temporal.py` in `REPORT_ONLY` mode and records a machine-readable RF-000..RF-008 inventory; finding contradictions does not mutate their source documents.
8. Dated decision/evidence statements and explicit historical markers are inventoried separately and cannot override current projection fields.
9. 2026-08-04: project owner approved RF-008-S2. S2 adds fixture-backed lifecycle and cross-level predicates but intentionally keeps repository enforcement in `REPORT_ONLY` mode.
10. RF-001 through RF-005 closed batches contain legacy nonterminal slice projections. S2 preserves those records; S3 must explicitly register their disposition before enabling a blocking gate.
11. RF-008-S3 remains unapproved and must not be inferred from S2 completion.
12. 2026-08-04: project owner approved RF-008-S3. The blocking gate uses exact contradiction fingerprints; a changed observation is not covered by an old grandfather entry.
13. Five RF-001..RF-005 legacy batch/slice projection groups are registered as grandfathered current projections. Their historical decision and evidence files are not rewritten.
14. RF-008 closed after enforcement, cross-document validation and ReleaseIdentity snapshot comparison passed; governance synchronization did not create runtime acceptance.
