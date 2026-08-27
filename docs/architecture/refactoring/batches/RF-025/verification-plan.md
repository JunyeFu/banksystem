---
id: DOC-ARCH-RF025-VERIFY
title: RF-025 Verification Plan
document_type: test-plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Verification Plan

S0 is document/governance-only. S1 uses temporary ledger roots and synthetic v4 identities to prove exact 9x2 cardinality, immutable terminal records, stale identity exclusion, duplicate suppression, checkpoint safety and no v3 import. S2 injects lifecycle, CLI and readback ports to prove fixed order, exact approval pauses, restart, first-failure stop and per-chain readback without services or model traffic. S3 validates same-identity SBOM/DPAPI evidence and rejects missing, stale or cross-identity gates. S4 proves cold rollback requires a distinct exact authorization and that only a human decision can transition an eligible record to `GO` or `NO_GO`.

S2 offline evidence is complete: focused contracts 24/24, existing MCP contracts 18/18, Node 24 lifecycle/composition 33/33, lifecycle wrapper 1/1 and the registered suite 556/556. These results validate code and injected integrations only; they are not TP09 or full18 LIVE evidence.

S3 implementation evidence adds 10/10 release-gate contracts and one real temporary CurrentUser DPAPI restart/restore, bringing the RF-025 focused matrix to 34/34 and the registered suite to 566/566. The actual evaluator currently stops before downstream gates with `AGENT_MODEL_BINDING_REQUIRED`; live audit and same-identity S3 execution remain deferred until a bound identity has 18/18.

S4/S5 implementation evidence adds seven cold-rollback fault/immutability contracts and expands release eligibility/human-decision coverage to 14 tests. The combined RF-025 matrix is 45/45 and the registered suite is 577/577. Tests inject the cold lifecycle and write only temporary evidence; they do not constitute a real rollback or human decision.

LIVE verification is deferred until TP09 is accepted and the project owner names the bound v4 identity plus exact permissions. The live done predicate is: `currentPassed=18`, `required=18`, every current record and readback equals that identity, all machine gates are current, cold rollback evidence is separately authorized, and the project owner records the final decision.
