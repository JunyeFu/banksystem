---
id: DOC-ARCH-RF018-EVIDENCE
title: RF-018 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-018 Evidence Index

Status: CLOSED on 2026-08-26. Only CONTRACT, fault-injected isolated INTEGRATION and GOVERNANCE evidence is admissible.

- Dependencies: controller locks `@langchain/openai@1.5.0` and `@modelcontextprotocol/sdk@1.30.0`; production audit reports zero vulnerabilities.
- Adapter matrix: 19 tests passed, 0 failed. It covers exact loopback URL, JSON/no-tool/zero-retry model configuration, timeout/cancellation, canonical MCP results, exact argument/hash/version/idempotency fences, duplicate rejection, disconnect, business conflict, stale reads, invalid success bodies and composed read/write/readback.
- Controller regression: 65 tests passed, 0 failed.
- Registered product suite: 520 tests passed, 0 failed; two governed media-binary prerequisite exclusions remain explicit.
- Governance: RF-018, temporal and documentation validators pass; `git diff --check` exits 0.
- Runtime boundary: all transport/model interactions used injected fakes. No service start, real endpoint request, LIVE, ledger write, identity freeze or publication occurred.
- Identity boundary: legacy v3 calculator emits unfrozen candidate `80d2c166f175c562ebb956edf5b11f622f60a6ef4b488f3cdf3c184fd8f5d640`, but does not yet cover the complete v2/adapter set. TP07 remains the v4 freeze gate.
