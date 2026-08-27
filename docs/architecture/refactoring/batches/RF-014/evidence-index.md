---
id: DOC-ARCH-RF014-EVIDENCE
title: RF-014 Evidence Index
document_type: evidence
domain: architecture
status: completed
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-014 Evidence Index

Status: `COMPLETED` for offline preparation only.

| Evidence | Class | State |
|---|---|---|
| Shadow and identity matrix | CONTRACT/synthetic INTEGRATION | PASS: 8/8 |
| Current identity projection | STATIC | PASS: `fbe97820...69630`; controller 10; release 170; ledger 0/18 |
| Real Shadow observations | RUNTIME | NOT_RUN: requires separate authorization |

## HENGZHUN-I10-AG05-SHADOW-LIVE-001

- Authorized and attempted at `2026-08-25T03:09Z` under ReleaseIdentity `fbe97820dbb5d8132a3f678d886524a5f75215b212bb5181cfda8960fca69630`.
- Managed START reached business-ready state, real controller and vision probes passed on first attempts, and the private Flowise publication was read back through the public API.
- The first Shadow baseline executor invocation failed before any HTTP request: stdin was parsed as CommonJS while using top-level `await` (`SyntaxError: await is only valid in async functions and the top level bodies of modules`).
- Per the authorized first-deterministic-failure stop rule, no retry, Flowise baseline request, candidate model call, or Shadow sample was executed.
- Managed STOP completed for Flowise, Worker, MCP, and Harness.
- Inspector comparison: identity unchanged; source/deployed hashes unchanged; acceptance ledger `0/18 -> 0/18`.
- Runtime result: `FAILED_PRE_REQUEST_EXECUTOR_MODE`; this is not AG-05 Shadow acceptance evidence.
