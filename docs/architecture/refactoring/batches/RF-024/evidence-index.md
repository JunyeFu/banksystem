---
id: DOC-ARCH-RF024-EVIDENCE
title: RF-024 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-024 Evidence Index

Status: PROPOSED. S1, S1B, S1C and the S2 offline execution seam are implemented; S2 LIVE is not authorized and has no runtime evidence.

- S1/S1B/S1C production integration: offline integration 15/15 under Node 24. A fresh run made zero calls before approval; exact approval called `journey_prepare` once, rebound the encrypted session to its returned Journey, hydrated Controller v2, then a second exact approval called `journey_input_submit` once. Public version readback binds the configured-model identity without opening MCP/session state; attachment bytes are accepted only by loopback Harness. Follow-up forks a new encrypted thread on the same Journey, rejects attachment carryover and cannot bypass an unresolved approval. Evidence is a pure bounded `journey_get` projection with no href or download grant. Credential enrollment uses a separate typed DPAPI operation: zero calls before HIGH exact approval, exactly one `credential_session_create` after store restart, and no second mutation on rejection, replay, argument tamper, expiry or launcher failure.
- Terminal composition: headless 13/13 and TUI 14/14 under Node 24. Default interactive, `--continue`, Journey `--resume`, operation `--resume`, `credential enroll` and `/credential` delegate to the production service. A real PTY opened the 80-column UI and `/exit` produced application exit code 0. The Codex PowerShell PTY wrapper itself reported 1 despite the direct `RUNCLI_CODE=0` marker; this is retained as a harness observation, not classified as an application failure.
- Encrypted state-store matrix: 15/15 under Node 20, covering Journey sessions and typed operation sessions. One-time pre-checkpoint Journey rebind passed; a second rebind after resolution failed closed. Operation arguments remained DPAPI encrypted and completion removed them.
- Normal lifecycle/v4 matrix: 18 tests passed under Node 24. Exact configured-model identity authorization, Flowise absence, Harness/MCP/Worker order, port ownership, runtime fingerprints, transactional rollback, exact-owned stop, local runtime-env precedence and cold rollback isolation passed.
- L1 orchestration matrix: 7 tests passed. Public readback precedes both variants; `TEXT_ONLY` precedes `TEXT_WITH_IMAGE`; an exact `sessionId + proposalId + contentHash` checkpoint is required; first deterministic failure blocks the second variant and owned services stop in `finally`.
- Registered suite: 84 files registered, 82 CI-runnable and 2 governed-runtime exclusions; final run passed 532/532 in 85.192 seconds. The release-state hash set was unchanged.
- Supply chain/governance: offline SBOM current with 141 components; refactoring validation PASS; temporal inventory reports zero current contradictions and five grandfathered historical contradictions.
- S1C completion source-frozen unbound v4 identity: `0c864c0bc2718a0a9076d23cba2b37f71cff60e76290a0ed88309a0652fc903a`; code-set `7c6768261345a745b9dd5484bf75e1bc47f59eaa2658a62643b762e90cb74634`; 122 governed files (`agentCli=17`, `controller=18`, `mcp=3`, `lifecycle=7`, `harness=56`, `worker=21`). RF-025 later supersedes this source snapshot; neither identity is a configured-model bound LIVE identity.
- Read-only authority inspection at `2026-08-26T09:12:11Z`: runtime `UNAVAILABLE`; public API readback source `CACHED_EVIDENCE_FILE` and stale; legacy v3 ledger identity `9c146a91...02549f`; current 0/18 with 228 stale historical records and one checkpoint; `releaseAligned=false`. These facts block any LIVE or release claim.
- Evidence class is STATIC/CONTRACT/INTEGRATION only. MCP/model transports and the browser launcher in offline tests were injected, state roots were temporary, and capture URLs/tokens and credential plaintext were absent from persisted envelopes and JSONL. No managed service, formal database, model call, actual browser/form run, ledger write, publication or Flowise runtime was touched.
- S2 pending evidence: configured model/live input presence, newly bound v4 identity and exact authorization, real normal managed lifecycle, public readback, `TEXT_ONLY`, `TEXT_WITH_IMAGE`, immutable same-identity evidence and stop/restore result.
