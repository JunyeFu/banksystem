---
id: RF067-VERIFICATION-PLAN
title: RF-067 Verification
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-067 Verification

## Implemented commands and scope, 2026-10-21

- `npm.cmd --prefix platform/hengzhun-regression-system run typecheck` and `run generate:dist`: use the pinned Node20 compiler; no dependency installation or service reload.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1 -Scope Contract`: existing RF066 1.0 contract/characterization, 14 tests; not a production UI.
- Same entry `-Scope Integration`: compiles the Harness, checks the generated metadata contract, then runs workbench-persistence.test.cjs and workbench-mcp.test.cjs under Node20 (native SQLite ABI). The 19 tests use temporary SQLite, OS-assigned loopback test servers and owned child processes only.
- `npm.cmd --prefix platform/hengzhun-regression-system run check:tests`: both suites registered. Browser/LiveReadOnly remain NOT_IMPLEMENTED/3; no empty green receipt.
- Governance and docs commands remain as declared in batch.yaml.

## Exact SDK verification

The original installed MCP SDK is 1.30.0 although package.json/package-lock.json pin 1.31.0. Do not overwrite the original environment to make this check green. Official registry integrity for 1.31.0 matches the existing lock. A separate OS-temporary product mirror installed SDK1.31.0/Zod4.4.3 with `--ignore-scripts --no-audit --no-fund --omit=dev`; no install hooks or model calls. It reused the existing exact Node20 SQLite11.10.0 binary and parser dependencies through explicit junctions; this is not a full fresh clone or a fully reinstalled lock graph.

The mirror contains only required source/compiled modules, contracts, migrations, selected tests and historical JSON used by existing compatibility checks; no .env, live SQLite, volumes, run outputs or credentials. Run its workbench-persistence/workbench-mcp/mcp-v2-decoupling/mcp-interaction-contract suites with the pinned Node20 executable: final 37/37 passed. The first mirror omitted generated dist/contracts JSON assets; supplying those genuine build inputs resolved its three module-not-found failures, without product fixes or changed assertions.

Original dependency drift remains a production-entry condition for RF066-S2, not a new runtime fallback. Metadata /mcp/workbench and the original 39-tool /mcp surface share the existing process/token/port. No production endpoint was switched in this package.

## Impact regression

`Node20 --test scripts/verification/journey-evidence-verifier.test.cjs scripts/verification/harness-loopback-host.test.cjs` passed24/24 after changing only the existing terminal-migration expectation43→44. All candidate/data/foreign-key/evidence assertions remain; this is not LIVE evidence. Re-run actual commands only when their source/data changed; do not replace the retained original SDK mismatch with the isolated result.

Run the Contract and Integration scopes listed in [shared verification](../RF-066/verification-plan.md), plus this batch's governance and docs checks. Restart/reload only an affected owned service after safe checkpoint/queue inspection. No LIVE or money action is implied.

