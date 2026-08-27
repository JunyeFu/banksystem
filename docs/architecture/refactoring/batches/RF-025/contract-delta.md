---
id: DOC-ARCH-RF025-CONTRACT
title: RF-025 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Contract Delta

Add `hengzhun-agent-acceptance-ledger/v4` as the sole acceptance contract for the CLI Agent release. A terminal record is keyed by `releaseIdentityHash + caseId + variant + attempt`, contains immutable safe evidence references, and is current only when the exact v4 identity still matches. Older identities remain historical and are never counted.

Add a restartable full18 checkpoint that stores only the current identity, ordered chain key, exact approval tuple, terminal status, safe failure code and timestamps. Raw user input, attachment paths, model output, credentials, capture URLs and tokens are forbidden.

Add a bounded Journey evidence view for CLI acceptance. A terminal view may expose `terminal`, approved authority identifiers and safe artifact-card metadata/digests; it must not expose URLs, query strings, tokens, credentials, capture locations or raw payloads. `COMPLETED` without the chain-specific authority references is not admissible evidence.

Runner checkpoints are `RUNNING`, `AWAITING_APPROVAL`, `APPROVAL_EXECUTING` or `FAILED_DETERMINISTIC`. Only the frozen exact approval tuple can leave `AWAITING_APPROVAL`; `APPROVAL_EXECUTING` cannot be replayed after an ambiguous restart, and `FAILED_DETERMINISTIC` blocks all later chains.

Add a release-decision projection with machine states `NOT_READY`, `ELIGIBLE_FOR_HUMAN_DECISION` and human-owned terminal states `GO` or `NO_GO`. A caller cannot supply computed gate results or manufacture `GO`; they are read from the v4 ledger and current gate evidence.

S3 implements only the fail-closed prefix of that projection. Exact 18/18 is checked before any public readback, live dependency audit or DPAPI drill. Same-identity source/readback/SBOM/audit/DPAPI success yields `machineGatesReady=true` but remains `NOT_READY` with `nextGate=COLD_ROLLBACK`; only S4 may supply separately authorized cold-rollback evidence and only S5 may record a human decision.

Add `hengzhun-flowise-cold-rollback-evidence/v1` under a separate evidence root. It binds one exact identity, disabled normal profile, equal before/after normal-evidence hashes, exact cold shutdown and `evidenceReusableByNormalProfile=false`; it is immutable and never contributes to 18/18.

After valid cold evidence, repeat the bound public readback and emit `ELIGIBLE_FOR_HUMAN_DECISION`. Add `hengzhun-agent-release-decision/v1`, keyed by identity, with explicit `GO|NO_GO`, fixed `project-owner` actor, eligibility hash, immutable timestamp and pointers to the v4 ledger, cold evidence and frozen eligibility snapshot. Missing exact human authorization produces no write.
