---
id: DOC-ARCH-RF016-CONTRACT
title: RF-016 Contract Delta
document_type: contract
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-016 Contract Delta

- MCP active tools: 33 to 35; reads 11 to 13; mutations remain 22.
- Add `candidate_compile` and `result_inbox_ack`.
- Remove conditional writes from `candidate_get`, `candidate_preview`, and `result_inbox_list`.
- Canonical public attachment field is `attachmentRef`; legacy `flowiseFileRef` is accepted only under explicit cold rollback mode.
- Add `POST /v1/i10/attachments:import` returning `AttachmentReceiptV1`.
