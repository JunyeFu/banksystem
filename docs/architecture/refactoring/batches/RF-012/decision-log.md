---
id: DOC-ARCH-RF012-DECISIONS
title: RF-012 Decision Log
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-012 Decision Log

1. 2026-08-25: RF-011 closed; AG-03 starts as an inactive security batch.
2. TTL is enforced by a controller-owned registry even while the checkpointer is in memory.
3. Trace output is allowlist-only; redaction is not a regex replacement over arbitrary payloads.
4. Scratch VFS is in-memory only and is not exposed to the current Deep Agents profile.
5. Raw user input and mutation arguments use ephemeral in-memory vaults; checkpoint stores only hashes and references.
6. 2026-08-25: RF-012 closes after 15/15 assertions and unchanged identity/ledger. AG-04 will intentionally create a new identity.
