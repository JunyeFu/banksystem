---
id: DOC-ARCH-RF019-TARGET
title: RF-019 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-019 Target Design

Use a versioned envelope with safe metadata and a CurrentUser DPAPI ciphertext. Atomic same-directory write/flush/rename protects the last good envelope. The encrypted payload owns events, LangGraph checkpoint snapshot and pending proposal arguments. Hydration validates schema, session/thread/namespace/journey/release binding, ciphertext digest, TTL and DPAPI authentication before returning state. The plaintext index contains only irreversible identifiers, timestamps, status, versions and hashes.
