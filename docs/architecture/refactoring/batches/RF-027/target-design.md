---
id: DOC-ARCH-RF027-TARGET
title: RF-027 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-027 Target Design

Docker Compose owns bank containers and named volumes. A pinned Node 20 builder produces each Vite portal and a pinned Nginx image serves it. Root PowerShell orchestration invokes Compose and the existing `NORMAL_CLI` Agent lifecycle without duplicating service ownership or calling Flowise.

S2 exposes one root command surface: `prepare`, `up`, `status`, `down` and `reset`. `prepare` accepts exactly one OpenAI-compatible model binding through `HENGZHUN_MODEL_NAME`, `HENGZHUN_MODEL_BASE_URL` and `HENGZHUN_MODEL_API_KEY`. `down` preserves Compose volumes; only `reset` removes project-owned volumes and local Agent runtime data. Status output is secret-free and distinguishes configured, running and ready states.
