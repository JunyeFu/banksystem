---
id: DOC-ARCH-RF047-DECISION-LOG
title: RF-047 decision-log
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-08
owner: Codex
---
# RF-047 decision-log

2026-09-08: user approved RF-047 registration and S1 offline work. Observed defects: RESPONSE COMPLETED bypasses evidence verification; cached PASSED bypasses current-identity verification. Reuse RF-046 public byte verifier; do not introduce a second execution state owner.

S1 evidence contract adds file byte digests and the expected terminal/evidence predicate. Actual synthetic L1 fixture selection and OCR/business assertions must be frozen before S2/S3; S1 does not claim those LIVE inputs were executed or accepted. Existing checkpoints without the new input contract are retained but cannot be reused.

Final source review moves current-identity verification to every completed variant, before recording its success or launching the next variant. The source-drift regression proves TEXT_WITH_IMAGE is not invoked after a post-text identity change. No retry or alternative execution path was added.

S1 closed after 21/21 L1 contracts and 654/654 registered tests. Synced task package -> S1 -> batch BLOCKED -> implementation order and backlog REVIEW -> three-level S00 EVIDENCED. A06 stays BLOCKED; S2/S3 require separate LIVE authority and frozen synthetic inputs.

2026-09-08: user explicitly authorized freezing and S2/S3 LIVE. The scope includes owned service lifecycle and the configured single model, not Full18, release, reset, banking writes or automatic proposal approval. Existing S1 results remain unchanged. L1 business is login and cross-page profile name/avatar equality, not the RF-046 account-balance scenario. Both natural-language inputs and a synthetic requirements-card PNG were frozen under `agent/runs/rf047/live-001`; the PNG is input only, never browser evidence. Configured-model prepare passed and froze identity `445ed03a549202b32083e4a42c4d6ff7ede2550ab72a43bcc34905b30d6e2bcf` with input-contract SHA-256 `4c11a644fc4e0460c30df23ddefd9fb484ae0a9feb80638831bc1c68801c3bde`. Human approval is still required for each newly generated exact proposal.

2026-09-21: after the Journey-bootstrap approval, the owned bank stack failed readiness before L1 execution: core containers were running but the channel set was not ready. The deterministic attempt stopped, no browser action or banking write occurred, and all owned services were stopped with volumes preserved. The prior proposal must not be replayed automatically; a new current proposal is required after runtime readiness is restored.
