---
id: DOC-ARCH-RF013-TARGET
title: RF-013 Release Identity Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-013 Release Identity Target Design

ReleaseIdentity v3 adds an immutable `controller` component with `kind`, framework lock hash, graph/code-set hash, prompt hash, tool-policy hash, non-secret model configuration identity and checkpoint schema version. The controller release manifest names every governed file. A secret-key scan rejects unsafe manifest fields.
