---
id: DOC-ARCH-RF029-EVIDENCE
title: RF-029 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-31
owner: Codex
---

# RF-029 Evidence Index

## Baseline

- Worker source loads Playwright and Midscene via `runtime/node_modules`.
- The runtime freeze requires Playwright 1.59.1, Midscene 1.10.5 and Chromium revision 1217.
- The current local runtime contains ignored artifacts, but new clones have no tracked package manifest or lockfile to reproduce them.
- This batch owns that missing install contract. No Flowise runtime, service, model call, bank transaction, LIVE_E2E or release assertion has occurred.

## S1 closure (2026-08-31)

- The locked runtime manifest and package lock now declare Playwright `1.59.1`, `@midscene/web` `1.10.5` and `@midscene/cli` `1.10.5` exactly as the frozen runtime contract requires.
- Agent Node 20/npm completed `ci --omit=dev --ignore-scripts --no-audit --no-fund` in `runtime`, adding 654 packages. The fixed Chromium revision `1217` already existed at the frozen local path and was verified without a browser redownload.
- `verify-agent-browser-runtime.ps1` passed: `AGENT_BROWSER_RUNTIME_CONTRACT=PASS playwright=1.59.1 midscene=1.10.5 chromium=1217`.
- Root lifecycle contract, RF-027 and RF-029 governance, document validation and `git diff --check` passed. The diff check emitted only pre-existing line-ending notices.

RF-029-S1 and RF-029 are closed. This is INSTALL and CONTRACT evidence only; it does not claim a started product, bank path, model call, browser execution, LIVE_E2E, Full18 or release outcome.
