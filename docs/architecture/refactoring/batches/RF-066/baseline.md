---
id: RF066-BASELINE
title: RF-066 code baseline
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 code baseline

## Current source facts

- Git root is `D:/Agent/banksystem`, branch main, HEAD `552b3b8ac517bd5991bff446e72d9f4e87ea9543`. Read-only Git inspection found 272 tracked changed paths; untracked prior batches and files also exist. No broad staging or resets.
- ACTIVE: `apps/quality-case-portal/src/App.tsx` is the eight-section read-only Quality UI. Its `api.ts` uses `/api/quality/v1`; `vite.config.ts` fixes `/quality/`. Keep this surface and do not add Quality writes.
- ACTIVE: `agent-cli/src/production-service.mjs` owns production service composition, start, continue, sessionList, sessionShow, authoring and execution. `sessionShow` exposes safe metadata only; it is not a transcript endpoint.
- ACTIVE: `controller/src/session-store.mjs` is a Windows DPAPI encrypted checkpoint store. Continuation currently forks an encrypted session while keeping the Journey; a browser conversation ID must not be confused with each checkpoint ID.
- ACTIVE: `createEnvironmentProductionService` binds one model from local three-variable configuration, computes model identity, connects MCP and enables direct execution. There is no browser model catalog/configuration API.
- ACTIVE: Harness SQLite is execution/regression authority; controller checkpoints are not a substitute for a second execution ledger.
- No Agent chat HTTP transport or generated browser contract was found in the inspected entry paths. These are confirmed gaps, not deleted legacy code.

## Runtime preservation baseline

Read-only `docker ps` reported the existing 15 containers running (including the already-running optional admin tool); do not stop it as part of this UI task. No Docker mutation, model call, transaction, database read or secret-file read was performed.

## Accepted design and blocker

Figma file `AGcoUj1UHujnoV0EPhvGLN`: main `2:60`, menu `12:1201`, configuration `11:1017`. Approved typography is Noto Sans SC Regular 14px / 22px. All model names and business results in the design are examples.

This turn's two get_design_context requests and whoami request failed at the connector transport to chatgpt.com. No fresh high-fidelity design response is available. Existing preview PNGs establish the approved visual decision, not a completed implementation. Product source and runtime remain unchanged.


