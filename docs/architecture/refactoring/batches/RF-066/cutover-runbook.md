---
id: RF066-CUTOVER
title: RF-066 scoped cutover
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 scoped cutover

Build the Agent entry separately; do not replace the Quality entry or restart the Docker stack. Check/register the chosen loopback port before starting a newly owned web process. Record its exact PID and health, then open the Agent URL.

Harness/MCP changes, if necessary, require their managed per-service reload with checkpoint/queue inspection; never broad `down`, `reset`, Docker restart or volume operations. Revalidate existing Quality GET behavior and original container uptime. Do not claim this step completed: no new service has started.


