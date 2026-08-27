---
id: DOC-ARCH-RF006-DECISIONS
title: RF-006 Decision Log
document_type: decision
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Decision Log

1. 2026-08-03: user approved creation of the four-level control chain only.
2. Selective rerun is evidence-preserving invalidation, not a shortcut around gates.
3. ReleaseIdentity worker-set repair belongs to RF-007.
4. The edited RF-005 decision log remains user-owned history; any instruction there to force all 18 reruns is not execution authority for this new sequence.
5. Implementation requires separate approval of RF-006 task packages.
6. 2026-08-03: project owner approved RF-006-S1 only. S2/S3 and all runtime mutation remain blocked.
7. S1 completed with STATIC/CONTRACT evidence only; it earned no runtime acceptance label.
8. A pre-existing concurrent M3 acceptance process changed the live checkpoint count during S1. It was preserved and excluded from S1 causality.
9. RF006-B05 (stale authoring text overriding a terminal latest reply) is assigned to S2.
10. 2026-08-03: project owner approved RF-006-S2. The approval covers deterministic invalidation/reuse, authoring idempotency, terminal-aware polling and stage timing only; S3, publication, service reload and LIVE_E2E remain blocked.
11. RF-006-S2 completed with 27/27 focused tests and unchanged ReleaseIdentity. Its evidence is CONTRACT plus isolated INTEGRATION only.
12. Existing Harness idempotency, preparation version checks and Worker leases remain the authority for authoring job ownership. S2 adds acceptance-level current-checkpoint recovery and does not duplicate that state machine in Worker.
13. Fixed polling is retained only behind `I10_RF006_S2_ENABLED=0`; the default path is bounded terminal-aware backoff.
14. RF-006-S3 remains unapproved. S2 completion does not authorize service reload, Flowise publication, thin LIVE_E2E or full-18 execution.
15. 2026-08-03: project owner approved RF-006-S3. Live preflight found `releaseAligned=false`, a Worker expected/observed code-version mismatch, and stale public-API readback evidence, so the approved task remains blocked by its explicit RF-007 runtime-alignment prerequisite.
16. No S3 comparison, service mutation, publication or LIVE_E2E run may start while that prerequisite is false. The approval remains valid after RF-007 alignment; old 18/18 reuse remains outside S3.
17. 2026-08-04: RF-007 closed the runtime-alignment prerequisite with ReleaseIdentity `6a1fd9a7...`, aligned WorkerCodeSet and one current-identity L1 thin chain.
18. S3 isolates legacy/selective ledgers under `.data/evidence/i10/rf006-comparison/**`; the official acceptance ledger is immutable during comparison.
19. Both legacy and selective L1 runs must independently pass authoring, pure Playwright, 2x2, activation, formal execution, inbox and terminal Artifact gates.
20. Legacy completed in 85,825 ms and selective completed in 62,870 ms, saving 22,955 ms while preserving all gates.
21. Selective replay created neither a second terminal record nor a second run directory. `I10_RF006_S2_ENABLED=0` remains the verified rollback switch; the absent/default setting enables selective mode.
22. RF-006-S3 and RF-006 are CLOSED. S3 does not authorize the remaining 17 variants or RF-008 implementation.
