---
id: DOC-ARCH-RF025-DECISIONS
title: RF-025 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-025 Decision Log

- The Flowise-era acceptance ledger v3 remains immutable historical authority for its own release schema and is not migrated into CLI Agent v4.
- Full18 means exactly nine cases times two variants under one bound v4 identity, not 18 arbitrary successes or a sum across attempts.
- A current projection chooses the highest immutable passed attempt for one exact case/variant and identity; duplicates never increase the count.
- Each mutating CLI proposal retains its normal exact approval. The full18 runner coordinates checkpoints but does not batch, infer or auto-grant approvals.
- Public readback is required after each terminal chain and again before release eligibility. Sender-side success is insufficient.
- A generic Journey `COMPLETED` status is insufficient. Admission also requires the bounded script/certificate/decision/execution/inbox/artifact authority references for that chain; the MCP projection may expose only their safe identifiers and artifact digests.
- First deterministic failure is terminal for the current invocation. Only an explicitly classified, idempotent recovery may resume the same checkpoint.
- Once an exact approval enters `APPROVAL_EXECUTING`, a crash leaves an ambiguous write boundary. The runner locks the checkpoint and never replays the mutation automatically.
- TP09 L1 evidence is not copied into the v4 ledger on trust. Both variants must use the same bound identity and each Journey plus the public identity must be re-read before admission.
- Cold rollback has a separate authorization and identity. Its evidence proves recoverability only and cannot satisfy normal-profile 18/18.
- Machine completion stops at `ELIGIBLE_FOR_HUMAN_DECISION`; final release authority remains human-owned.
- S3 gate execution is ordered after exact 18/18. Before that point the evaluator performs no public readback, dependency audit or DPAPI drill; callers cannot submit precomputed gate labels through the command interface.
- Passing source/readback/SBOM/audit/DPAPI gates is not release eligibility while cold rollback is pending. S3 therefore returns `NOT_READY` plus `machineGatesReady=true` and `nextGate=COLD_ROLLBACK`; S4/S5 own the later transitions.
- Cold rollback authority is `HENGZHUN_AUTHORIZE_FLOWISE_COLD_ROLLBACK=<identity>` and is independent of the normal CLI LIVE switch. Its evidence root is outside normal v4 acceptance, records no reusable normal pass and is immutable per identity.
- Cold success requires exact shutdown of all four legacy services, no residual cold state or Flowise observation, and a byte-stable normal v4 evidence tree. A successful probe without cleanup is failure.
- The machine may emit `ELIGIBLE_FOR_HUMAN_DECISION` only after consuming valid cold evidence and performing a second final public readback. An immutable `GO` or `NO_GO` additionally requires `HENGZHUN_PROJECT_OWNER_RELEASE_DECISION=<decision>:<identity>` and can never be inferred from eligibility.
- S0 cannot list non-existent future source files in the governed batch scope. Each implementation slice must first add its exact source paths to `batch.yaml`, within the frozen budgets, before product edits begin.
