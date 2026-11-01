---
id: RF066-TARGET
title: RF-066 target boundary
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 target boundary

## Ownership and one user capability

This document gives the shared integration boundary. RF066 implements only CLI/Controller transport and model configuration; Harness/MCP persistence is RF067 and frontend/acceptance is RF068. The five task packages are distributed accordingly; no batch opens more than two modules. Execution order is defined only in the unique order file.

A local browser can converse with the same Agent as the CLI, reopen historical conversations, choose a model for the next task and configure a local BYOK connection.

## Transport and ownership

- Keep Quality at `/quality/` with GET-only APIs. Reuse React/TypeScript/Vite/Ant Design dependencies; add a separate Agent entry/build within the existing frontend package rather than replace Quality.
- Add a loopback-only Agent web transport around the existing production service, not a second planner, execution engine or state authority. Proposed TCP 18790 must be checked and registered in the global port registry before binding; no port is allocated by this document.
- Browser calls `/api/agent/v1`. Controller operations call MCP; Harness owns persisted conversation/message metadata in its existing SQLite. Raw checkpoint payloads, proposal arguments and internal reasoning never become browser responses.
- Persist a stable conversation ID plus message/turn IDs, checkpoint-session links, Journey/Run links, status and selected model binding. A refresh must not replay POST or silently repeat funds actions. Historical messages are not automatically resubmitted as whole model context.
- Reuse DPAPI for the model-key vault. SQLite stores profile metadata and a credential reference, not a plaintext API key. The browser may submit a key only to the local configuration endpoint and never reads it back.
- A task snapshots one model binding and ReleaseIdentity. Changing the default affects subsequent tasks only. Config changes do not freeze identities or validate old evidence. Historical stale-identity conversations remain readable; execution remains subject to existing gates.
- Same-origin/loopback/Host and CSRF boundaries protect browser writes. Browser bundles never contain Harness or MCP service tokens. Input/type validation is at HTTP/MCP boundaries.
- Display auditable tool events and concise execution summaries, not private chain-of-thought. Missing inputs and failures remain explicit; no proposal approval gate, backup model, hidden retry or self-repair is introduced.

## Real behavior, not design examples

New users see an empty history. Greetings and example prompts are UI copy; runs, balances, schedules, IDs, status and model availability must come from APIs. Starting a missing-input conversation must not submit money. The existing continue/fork and Journey NEEDS_INPUT paths must be characterized before selecting the continuation method.

## Visual lock

Use the approved dark graphite palette, 248px desktop sidebar, 832px composer/content column, 14px Regular / 22px text, existing brand SVG and Ant Design icon assets. Source high-fidelity Figma context before frontend edits. The implementation replaces design-only sample labels with real data and removes the design-preview disclaimer; these are intentional production differences.


