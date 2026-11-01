---
id: DOC-ARCH-RF027-CONTRACT
title: RF-027 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-027 Contract Delta

Portal URLs and bank APIs do not change. Deployment changes from host `dist` mounts to immutable local images, and core PostgreSQL changes from an absolute bind mount to a Compose named volume.

S2 adds `.\demo.ps1 prepare|up|status|down|reset` as the only root lifecycle contract. Success returns `0`, invalid command or configuration returns `2`, and dependency or readiness failure returns `3`. No command calls Flowise. `down` preserves data; `reset` is the sole destructive lifecycle command.
