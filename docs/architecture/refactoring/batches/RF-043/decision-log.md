---
id: DOC-ARCH-RF043-DECISIONS
title: RF-043 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-043 Decisions

- Use an explicit author command instead of renaming the historical bootstrap flow.
- Send only the natural-language goal and target-system name to the model; bind the entry URL and non-secret credential reference deterministically before the Harness write.
- Persist the candidate through existing MCP and Harness; do not add a local platform database.
- Keep approval and execution outside RF-043.
