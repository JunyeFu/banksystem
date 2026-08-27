---
id: DOC-ARCH-RF021-TARGET
title: RF-021 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-021 Target Design

Use a pure event reducer and deterministic view model over `hengzhun-cli-event/v1`. A pi-tui component renders header, transcript, stage, footer and approval overlay at bounded widths. Input generates application intents only; it never owns Journey or proposal truth. HIGH approval requires the exact final eight proposal characters. Attachment paths remain transient intent data and never enter state or rendered history.
