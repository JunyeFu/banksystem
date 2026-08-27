---
id: DOC-ARCH-RF006-TARGET
title: RF-006 Target Design
document_type: design
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Target Design

The acceptance driver computes a deterministic invalidation plan before execution.

1. Classify changed surfaces into intake, controller, authoring, builder, runner, platform/publication and evidence-only.
2. Reuse an artifact only when its producer identity, normalized input hash, target profile, credential binding status, candidate hash and downstream contract version are unchanged.
3. Cache no LIVE_E2E conclusion: reused artifacts remain inputs to required live gates.
4. Prevent duplicate authoring by an idempotency key bound to journey, draft, target profile and authoring identity.
5. Replace fixed serial polling with terminal-aware backoff and bounded parallel status reads where isolation is proven.
6. Emit stage start/end/duration, poll count, retry count, cache decision and invalidation reason to one machine-readable timing ledger.

Parallelism is deferred for shared browsers, credentials or mutable schedules until isolation tests prove safety.

## S2 implementation boundary

Items 1-6 are implemented for the acceptance driver and verified by focused contract/isolated-integration tests. Authoring ownership remains in the existing Harness idempotency and lease state machine; the acceptance driver prevents a second authoring journey by requiring recovery of an in-flight current-identity checkpoint. No runtime rollout or LIVE_E2E proof is claimed until a separately approved task performs it.

## S3 completion

The approved S3 task supplied the deferred runtime proof on 2026-08-04. A legacy and a selective L1 each traversed the complete live gate set. The selective replay reused the immutable terminal record without a second run directory. Selective execution remains the default and the legacy environment switch remains verified.
