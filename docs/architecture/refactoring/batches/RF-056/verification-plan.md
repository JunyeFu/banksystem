---
id: DOC-ARCH-RF056-VERIFICATION-PLAN
title: RF-056 verification plan
document_type: verification-plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-056 verification plan

S1: inspect real Keycloak access-token claims, run Java security tests and browser login/reload tests. S2: Java Customer/Statement tests. S3: port contract tests including transfer unknown-result and idempotency semantics. S4-S5: Java integration tests, document concurrent update test, financial golden path and EOD interruption/recovery. S6: ArchUnit, Java suite, both frontend builds/browser checks, Docker smoke and reconciliation. Each command's output is captured in the task package and evidence index. Static tests are not Agent LIVE or Full18.
