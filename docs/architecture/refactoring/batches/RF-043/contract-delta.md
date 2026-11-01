---
id: DOC-ARCH-RF043-CONTRACT
title: RF-043 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-043 Contract Delta

Add headless `journey author <sessionId> --input-file <path> --entry-url <url> --target-system <name> --credential-ref <ref> --jsonl` and read-only `journey validate <journeyId>`. Author returns `AWAITING_USER`; validate returns `VALIDATED` only from Harness stage `READY_FOR_CASE_APPROVAL`.
