---
id: DOC-ARCH-RF011-DECISIONS
title: RF-011 Decision Log
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-011 Decision Log

1. 2026-08-25: RF-010 closed and AG-02 is enabled as a separate inactive-kernel batch.
2. Dependency versions are promoted unchanged from RF-009 into the isolated `controller` subpackage.
3. The model never receives the 22 mutation tools; it outputs a proposal that a deterministic node validates and executes.
4. RF-011 uses in-memory checkpointing; persistent state and observability are deferred to AG-03.
5. Deep Agents structured-output binding adds an unnamed internal schema item; security observation counts only named callable tools. The sole named external tool is `governed_read`.
6. 2026-08-25: RF-011 closes after 10/10 focused assertions, zero dependency findings and unchanged product identity/ledger. AG-03 requires a new batch.
