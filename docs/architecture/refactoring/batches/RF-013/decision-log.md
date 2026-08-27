---
id: DOC-ARCH-RF013-DECISIONS
title: RF-013 Decision Log
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-013 Decision Log

1. 2026-08-25: RF-012 closed; AG-04 intentionally advances ReleaseIdentity schema.
2. Model identity is `UNBOUND_INACTIVE` plus protocol/profile/parameters; no endpoint or secret enters identity.
3. Prompt is moved from source literal to a governed text file so prompt drift is independently visible.
4. New identity invalidates all v2 acceptance evidence without rewriting it.
5. The frozen v3 identity is `ca0430ca9cac496937901f5980c5bd7df4c6f3598ae4ffa58718ea453fac9089`: controller code set `0c4412f9...62c4` binds 9 files and the total release set binds 169 files.
6. Ledger projection for v3 remains `0/18`; 228 historical records are stale and none were rewritten or promoted.
