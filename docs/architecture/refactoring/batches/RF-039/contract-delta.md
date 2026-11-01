---
id: DOC-ARCH-RF039-CONTRACT
title: RF-039 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-039 Contract Delta

`RegressionRun` gains optional `journeyId`, `correlationId` and lowercase SHA-256 `releaseIdentity`. Migration 040 adds nullable `runs.release_identity_hash`; no historical value is backfilled.
