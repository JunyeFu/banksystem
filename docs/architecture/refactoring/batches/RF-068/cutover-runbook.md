---
id: RF068-CUTOVER-RUNBOOK
title: RF-068 Cutover
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Cutover

Serve the separate Agent build from the RF066 loopback transport only after a port availability check/registration. Preserve existing Quality artifacts and Docker services. Capture real browser interaction evidence before changing task state.

Before implementation cutover, rebuild both outputs and compare the original Quality entry/API behavior. The Agent process uses RF066-owned composition and lifecycle; RF068 does not add another server. Verify the exact global port record, process ownership and safe migration backup; 18790 remains proposed until checked. Do not stop an already-running optional admin tool.

Only replace the affected owned Harness/MCP process when the existing managed mechanism can safely do so with no active task; otherwise keep original services and record the precise blocker. Do not run down/reset, delete volumes, change Docker AI, rebuild banking containers or advance Fineract business date. After acceptance keep services running; stop only the new owned web process if rollback is required.

