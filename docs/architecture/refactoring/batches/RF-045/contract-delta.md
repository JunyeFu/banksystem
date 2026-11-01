---
id: DOC-ARCH-RF045-CONTRACT
title: RF-045 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-045 Contract Delta

Add `journey execute <journeyId> --session <sessionId> --jsonl`. The command first binds the exact approved Journey target and credential through the MCP TargetProfile prepare/approval contract, then advances the authoring and execution chain. `journey author` accepts optional `--adapter fuxing-bank-demo`; any other value exits `2`, and omission keeps the generic target policy. The selected registered ID is carried as a structured `journey_prepare.adapterSelection`, frozen in the CaseDraft, and resolved by Harness to the registry-owned version and manifest hash. Exit `0` requires an authoritative Run and Task with a non-failure Worker-observed state; a Harness business failure is preserved as its safe error code and exits `4`. Evidence verification remains separate.
