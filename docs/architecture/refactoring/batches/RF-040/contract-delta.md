---
id: DOC-ARCH-RF040-CONTRACT
title: RF-040 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-040 Contract Delta

`hz-agent service status` replaces the single-word service command. Success is 0, command or input error is 2, unavailable dependency is 3, execution failure is 4, and evidence or release gate failure is 5. Existing explicit approval and cancellation terminals remain 20/21/130 until their owning A05 slices migrate.
