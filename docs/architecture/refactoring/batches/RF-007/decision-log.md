---
id: DOC-ARCH-RF007-DECISIONS
title: RF-007 Decision Log
document_type: decision
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-007 Decision Log

1. 2026-08-03: project owner approved RF-007-S1 only. S2/S3, service reload, Flowise publication and LIVE_E2E remain unapproved.
2. S1 is a red-characterization slice: its identity-alignment assertion is expected to fail until S2 implements the frozen WorkerCodeSet contract.
3. 2026-08-03: RF-007-S1 completed with a 24-file static execution closure, zero unresolved local imports and complete-set Hash `828f4d68da2717db95823783db0567adbdad3d397f962e99c5bb10c1dead3cba`.
4. The one dynamic candidate-script load is excluded from WorkerCodeSet because candidate source and certificate identity already bind it separately.
5. The deliberate red test is recorded as the S1 contract result, not a runtime failure or acceptance pass. RF-007-S2/S3 remain unapproved.
6. 2026-08-03: project owner approved RF-007-S2 only. S2 may change source identity consumers and focused tests, but may not reload services, publish Flowise, mutate acceptance state or run LIVE_E2E.
7. 2026-08-03: RF-007-S2 completed. One 24-file manifest and shared algorithm now drive ReleaseIdentity v2, Worker health v2, Harness readiness and lifecycle fingerprinting; 28 focused tests passed.
8. The legacy `workerCodeHash` remains readable as a deprecated single-file compatibility field. Readiness and all new evidence use `workerCodeSetVersion` plus `workerCodeSetHash`.
9. S2 source identity differs from the currently running identity by design. Only RF-007-S3 may perform managed reload/publication readback and establish runtime alignment.

10. 2026-08-03: user approved control-chain creation, not implementation beyond separately approved slices.
11. Full Worker identity is a prerequisite for runtime reload and evidence reuse decisions.
12. The canonical file set is shared by ReleaseIdentity, Worker and Harness; parallel bespoke lists are forbidden.
13. First runtime proof is one L1 thin chain after alignment.
14. Old 18/18 is reusable only under strict reconstructable equivalence; otherwise it becomes historical and affected chains rerun.
15. 2026-08-03: project owner approved RF-007-S3. The slice may perform managed reload, public API publication/readback and one L1 LIVE_E2E, but not an automatic 18-chain run.
16. S3 failed closed before publication: Windows `core.autocrlf=true` materialized all 36 clean SQL migration files as CRLF, while the immutable Git blobs and SQLite checksums are LF and match `36/36`.
17. The migration database is not corrupt and migration history must not be rewritten. A permanent checkout/checksum portability fix requires a separately approved prerequisite because it changes the migration-runtime boundary outside the S3 slice paths.
18. The previous desktop runtime was restored through managed START; four services are healthy and business-ready. A malformed controller-probe JSON response occurred after service health and is not accepted as publication or model readiness evidence.
19. 2026-08-03: project owner approved the migration portability prerequisite and continuation of RF-007-S3.
20. Migration checksums normalize CRLF transport to LF before hashing but execute the original SQL. Migration history and stored checksums remain immutable; non-line-ending drift remains a hard failure.
21. Worker health v2 is current only when its WorkerCodeSet version and complete-set Hash equal the lifecycle record.
22. A real L1 attempt exposed two environmental/flow defects: an unreachable bank portal caused fail-closed authoring before model invocation, and v7 mapped a terminal failed journey to processing. The portal was restored and the v7 route was corrected with unique condition outputs; neither failed attempt is acceptance evidence.
23. Final current ReleaseIdentity is `6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687`; public API readback, runtime health and WorkerCodeSet agree.
24. L1 `TEXT_ONLY` passed as `LIVE_E2E`; S3 deliberately stopped at `1/18` and did not run the image variant or the remaining cases.
25. Old 18/18 evidence is not reusable because exact ReleaseIdentity equality is false. The remaining 17 variants must be rerun under current identity only after separate authorization.
26. 2026-08-04: a read-only recheck confirmed ReleaseIdentity `6a1fd9a7...`, migration `36/36`, complete WorkerCodeSet alignment and official ledger `1/18` were unchanged. S1, S2 and S3 are complete; RF-007 is closed without rerunning L1 or the remaining 17 variants.
