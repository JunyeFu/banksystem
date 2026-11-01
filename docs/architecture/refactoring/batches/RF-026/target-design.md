---
id: DOC-ARCH-RF026-TARGET
title: RF-026 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-026 Target Design

The current product is a reproducible bank demo plus a CLI Agent. Fineract owns banking facts; Harness SQLite owns automation facts; Quality Portal is read-only. The single runtime controller is `hz-agent`; Flowise is historical evidence only. The A01-A08 portfolio owns macro dependencies while every implementation package still requires its own RF batch, slice and command-level task.
