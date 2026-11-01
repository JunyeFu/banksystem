---
id: DOC-ARCH-RF044-TARGET
title: RF-044 Target Design
document_type: target_design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-044 Target Design

CLI parses the complete tuple. Production service loads the bound encrypted session, reads the current Journey through MCP, compares version/proposal/hash, and submits exactly one HIGH-risk `journey_decision_submit`. Harness remains the only state writer.
