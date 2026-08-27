---
id: DOC-ARCH-RF009-VERIFY
title: RF-009 Verification Plan
document_type: test_plan
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Verification Plan

1. Verify exact package versions, registry provenance, MIT licenses, Node engines, install size and audit result before installation.
2. Test one synthetic happy path through interrupt/resume, one simulated mutation and authoritative readback.
3. Test checkpoint authority override, version conflict, approval hash mismatch, expiry, idempotency and mutation count.
4. Test unknown/write tool rejection and prompt-injection attempts that request shell, filesystem, SQLite, browser, credential or mutating MCP access.
5. Prove the Deep Agents planner is either safely bounded in-process or return `NO_GO` without widening tools.
6. Run dependency, documentation, refactoring, temporal, TP-00 and whitespace gates.
7. Recompute ReleaseIdentity and ledger status; both must equal the baseline.

All focused tests are `CONTRACT` or synthetic `INTEGRATION` evidence. They cannot earn a LIVE_E2E or release label.
