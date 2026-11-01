---
id: DOC-ARCH-RF053-CUTOVER
title: RF-053 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-053 cutover runbook

1. Complete the Java and portal builds.
2. Rebuild and replace only `bank-channel-service`.
3. Wait for Bank Channel health without stopping dependent services.
4. Execute the extended bank golden path.
5. Confirm Customer Portal returns its application shell and retain every managed service.
