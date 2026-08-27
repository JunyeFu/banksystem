---
id: DOC-ARCH-RF022-DECISIONS
title: RF-022 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-022 Decision Log

- Preserve legacy `i9-lifecycle.cjs` only as a cold rollback implementation; normal lifecycle uses a separate pure agent profile.
- CLI uses exact Node 24.19.0; existing Harness/MCP/Worker remain on their governed Node 20 runtime until a separately evidenced migration.
- V4 identity excludes Flowise graph/publication bytes and includes the cold rollback descriptor itself.
- 2026-08-26: RF-022 closed with source-frozen unbound v4 candidate `b709dfa9...766e`. Formal binding/freeze remains TP08/TP09 gated; no runtime mutation was performed.
