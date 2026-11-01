---
id: RF067-CONTRACT-DELTA
title: RF-067 Contract delta
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-067 Contract delta

## RF067-S1 frozen implementation boundary, 2026-10-21

The existing contracts/mcp/hengzhun-i8.json forbids additional tools on its 39-tool /mcp surface. Preserve that contract/version and the model's existing allowlist. Add one independently versioned metadata contract at contracts/mcp/workbench-metadata-v1.json, served at /mcp/workbench by the same authenticated loopback MCP process, not a new port/process/planner. The future RF066 adapter connects to this explicit metadata path; no fallback to the legacy surface.

Harness metadata routes remain bearer-authenticated and accept only the configured HENGZHUN_NAMESPACE (default hengzhun-local), while Repository methods enforce namespace-qualified keys. Write operations cover conversation creation, immutable versioned model metadata/default selection, atomic turn submission and optimistic event/status updates. Reads cover cursor history, turn events and current/historical model metadata. Keys are opaque DPAPI references only; raw credentials/private reasoning are rejected at boundaries. The source Zod definitions generate the single JSON contract; producer/consumer drift is checked.

Submit returns created=true exactly once. Replays of the same normalized request return the persisted turn with created=false; a changed payload is 409, not another dispatch. No Repository or metadata MCP handler calls an execution tool. An unresolved previous turn blocks a second execution; NEEDS_INPUT can create one bound continuation retaining model/identity/Journey. Reads after restart never claim or resume work. Scoped output uses existing L3/128KiB limits with message/event paging, never a global budget change.

Additive authenticated MCP/Harness metadata operations and one SQLite migration. Freeze shape against RF066 OpenAPI before implementation. The browser does not acquire service tokens or direct SQLite access.

