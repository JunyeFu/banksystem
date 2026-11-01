---
id: DOC-ARCH-RF040-TARGET
title: RF-040 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-040 Target Design

Doctor performs one sequential read-only probe of the configured model, Harness, MCP, Worker, frozen Chromium, and the bank gateway. It stops at the first failure, emits only a bounded code and check state, and never retries, changes state, selects another model, or invokes Flowise.
