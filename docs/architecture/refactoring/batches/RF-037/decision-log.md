---
id: DOC-ARCH-RF037-DECISIONS
title: RF-037 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-037 Decisions

- Project existing Harness records instead of creating a second quality database.
- Keep release gate `PENDING` and releases empty until the release workflow persists valid ReleaseIdentity evidence.
- Rely on the already enforced loopback listener boundary; never distribute the Harness service token to the browser.
