---
id: DOC-ARCH-RF016-BASELINE
title: RF-016 Baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-016 Baseline

The shared tree is dirty at Git `9d79b7c...`. MCP resolves its SDK from the Flowise app path. The 33-tool contract has 11 reads and 22 mutations, but `candidate_get`, `candidate_preview`, and `result_inbox_list` contain conditional writes. The current ReleaseIdentity and `0/18` ledger are preserved.
