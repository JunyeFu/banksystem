---
id: DOC-ARCH-RF024-VERIFY
title: RF-024 Verification Plan
document_type: test-plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-024 Verification Plan

S1 uses temporary DPAPI roots and injected MCP/model transports. Assert zero calls before approval, exactly one `journey_prepare`, one authoritative rebind, Controller hydration only after rebind, and exactly one subsequent business mutation. Reject expired, replayed, mismatched or post-checkpoint rebinds. S1C uses a separate temporary DPAPI operation root: assert zero credential calls before HIGH exact approval; one `credential_session_create` after restart; zero extra writes on reject, replay, expiry, tamper or launcher failure; and no capture URL/token or credential plaintext in envelopes or JSONL. Accept only the exact loopback capture URL shape, inject the launcher in tests, and persist completion before launch. S2 must snapshot runtime/public/ledger state, require a newly bound v4 identity and exact LIVE authorization, start only owned registered processes, read back current identity, run `TEXT_ONLY` then `TEXT_WITH_IMAGE`, stop at the first deterministic failure and restore or stop only processes it owns.
