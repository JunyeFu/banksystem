---
id: DOC-ARCH-RF025-TARGET
title: RF-025 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Target Design

RF-025 introduces a CLI Agent v4 acceptance plane rather than extending the Flowise v3 ledger. The v4 ledger admits immutable terminal evidence only when the record, runtime/public readback and current source all resolve to one exact bound v4 identity. Its current projection contains exactly nine cases (`L1`–`H3`) and two variants (`TEXT_ONLY`, `TEXT_WITH_IMAGE`) per case.

The full18 runner is restartable but never auto-approves. It selects the first missing ordered chain, delegates to the production CLI, persists only safe approval identifiers and hashes, stops on the first deterministic failure, then performs a current public readback before admitting a terminal record. It cannot translate a v3 record or Flowise transcript into v4 evidence.

TP09 L1 is a prerequisite but not a blind import source. The full18 runner re-opens both same-identity L1 Journey evidence views, checks their terminal authority references and artifacts, and re-reads the public identity before creating the corresponding v4 records. An `APPROVAL_EXECUTING` checkpoint is intentionally non-replayable after a crash because the mutation outcome is ambiguous.

Release gates are separate predicates: 18/18 current records, supply-chain recheck, same-identity DPAPI restore drill, separately authorized cold rollback, final public readback, and explicit human GO. Machine checks may produce `ELIGIBLE_FOR_HUMAN_DECISION`; only the project owner can produce `GO`.

The S3 evaluator short-circuits before public/audit/DPAPI work until 18/18 is current, derives every gate internally, and binds every result to the same identity. S3 success alone is intentionally `NOT_READY`: it exposes `machineGatesReady=true` and hands off to the separately authorized S4 cold-rollback gate rather than manufacturing eligibility.

S4 uses a distinct environment authorization and a distinct evidence root. It refuses active normal/cold state, snapshots normal evidence, starts/probes/stops the legacy four-service path, rechecks absence and accepts only an unchanged normal evidence hash. S5 consumes that record, repeats the final public readback, then waits for an exact project-owner `GO` or `NO_GO`; it never derives the human choice from machine state.
