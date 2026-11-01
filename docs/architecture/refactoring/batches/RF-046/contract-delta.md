---
id: DOC-ARCH-RF046-CONTRACT
title: RF-046 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-06
owner: Codex
---
# RF-046 Contract Delta

Add `hz-agent evidence verify <journeyId> --jsonl`. The output schema is `hengzhun-cli-evidence-verification/v1` and contains the Journey, Run, Task and ReleaseIdentity bindings, required evidence-kind coverage, safe artifact metadata, and a `VERIFIED` verdict. Exit `0` requires terminal PASSED/SUCCEEDED authority, exact current ReleaseIdentity equality, all five kinds `DOM|SCREENSHOT|TRACE|NETWORK|LEDGER`, and byte-size plus SHA-256 agreement for every registered artifact. Missing, mismatched, stale or unbound evidence exits `5` with a stable safe error code.
