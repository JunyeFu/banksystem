---
id: DOC-ARCH-RF009-CONTRACT
title: RF-009 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Contract Delta

Public product contract delta: **none**.

The PoC introduces experiment-local contracts only:

- `ReadOnlyPlannerPort.plan(facts, userInput) -> StructuredProposal`
- `SyntheticHarnessPort.read(journeyId) -> AuthoritativeJourney`
- `SyntheticHarnessPort.executeApproved(proposalRef, expectedVersion, idempotencyKey) -> MutationResult`
- stable failure codes for schema rejection, unknown tools, authority conflicts, stale/changed approvals and the one-mutation limit.

The current MCP 33-tool contract, Harness API, database schema, Flowise graph and ReleaseIdentity v2 remain byte-for-byte outside the RF-009 write surface.
