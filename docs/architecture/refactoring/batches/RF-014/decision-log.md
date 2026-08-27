---
id: DOC-ARCH-RF014-DECISIONS
title: RF-014 Decision Log
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-014 Decision Log

1. Shadow code never receives a mutation port.
2. Reports carry hashes and metrics, not raw text or arguments.
3. Synthetic success only establishes candidate readiness; real Shadow and cutover remain separate gates.
4. Current identity is `fbe97820...69630`; ledger remains `0/18`.
5. `HENGZHUN-I10-AG05-SHADOW-LIVE-001` stopped at the first deterministic failure before any request because the inline executor used CommonJS mode with top-level `await`; no Shadow comparison result may be inferred.
