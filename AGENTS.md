# Bank System - Agent Execution Rules

## Project context

- **Project**: External-demo complete open-source banking system plus full regression testing platform, designed for later intranet migration
- **Spec**: v5.4 external-demo baseline for the combined product; v4 remains the banking-core safety baseline
- **Tech stack**: Java 21 / Spring Boot 3.4.5 / React TypeScript Vite / PostgreSQL / Keycloak / ActiveMQ / Docker
- **Current state**: Banking core has a completed Phase 1 audit with 3 P0 + 11 P1 blockers; v5.4 AI authoring/regression capabilities remain partly planned/PoC and enterprise-platform integration is pending. See `docs/architecture/v5.4-external-demo-baseline.md`, the acceptance matrix, and the audit report.
- **Stage status**: S0-S6 DONE (with gaps), S7 NOT PASSED

## Critical rules (MUST follow)

1. **Fineract is the sole core truth source.** The databases `fineract_default` and `fineract_tenants` are core-owned - do not write to them directly. Use the Fineract REST API via `FineractAdapter` for all business changes.
2. **Browser clients MUST NOT directly call Fineract.** The correct chain is: Customer Portal -> Gateway (18443) -> Bank Channel Service -> Fineract Adapter -> Fineract API.
3. **All money write operations MUST include:** Idempotency-Key, Correlation ID, state machine, optimistic lock, outbox, audit hash chain, accounting assertion, reconciliation, failure compensation, and replay evidence.
4. **Money uses BigDecimal / NUMERIC(19,2).** Never use `double` or JSON number for monetary values.
5. **All schema changes go through Liquibase.** Do not use raw `CREATE TABLE IF NOT EXISTS` for new tables.
6. **All images must have immutable SHA-256 digests.** No `latest` tags.
7. **Test Support API is only available under `local`/`test` profiles** and requires `ROLE_TEST_SUPPORT`.
8. **Secrets must not appear in logs, responses, or committed files.** Use `.env` (gitignored) and Docker secrets for sensitive values.
9. **Cross-ownership modifications MUST be documented** in `agent/reports/`. See `agent/file-ownership.yaml` for owner assignments.
10. **Every task MUST pass quality gates** before moving to DONE: contract lint, build, unit tests, integration tests, accessibility review, financial E2E, and security review.

11. **The external demo MUST NOT be a degraded path.** Use synthetic/redacted data and isolated credentials, but retain banking invariants, independent script validation, Baseline comparison, evidence, audit, failure explanation, and recovery gates.
12. **AI authoring MUST remain separate from formal regression execution.** Scheduled regression runs execute only validated scripts and do not call LLM, Midscene, or vision models.
13. **HiAgentPattern, CozePlatformAdapter, and EnterpriseAgentPlatformAdapter are distinct concepts.** Do not claim enterprise tenant capabilities until validated in the target environment.

## Stage progression

```
S0 Baseline & Governance (DONE)
  -> S1 Platform, Identity & Trust (DONE)
  -> S2 Core Adapter, Channel Data & Contracts (DONE)
  -> S3 Three Business Clients (DONE)
  -> S4 Banking Business Closure (DONE - see audit for gaps)
  -> S5 Testability Foundation (DONE - see audit for gaps)
  -> S6 Observability, Recovery & Security (DONE - see audit for gaps)
  -> S7 Final Acceptance (NOT PASSED - see audit report)
```

## File ownership

Key principles:
- Frontend Agent does not modify database migrations
- Database Agent does not modify frontend code
- Fineract Adapter has a single dedicated owner (CoreIntegrationAgent)
- Money-related changes require BankingDomainAgent + Stage1Reviewer sign-off

## Review chain

```
Developer Agent
  -> Contract Lint
  -> Build
  -> Unit
  -> Integration
  -> Accessibility/Testability Review
  -> Financial E2E
  -> Accounting/Reconciliation Review
  -> Security Reviewer
  -> Human Reviewer
  -> Merge
```

## Rollback principles

Key rules (see `docs/architecture/rollback-principles.md` for full details):
- A failed stage does not advance.
- EOD failure does not advance business date.
- Money failures go through state machine, never overwrite original records.
- Post-restore must verify invariants: balance, identity mapping, audit hash chain, transfer state history, reconciliation.

## Scheduler

`agent/backlog.yaml` is the authoritative scheduler for banking-core stages S0-S7. v5.4 platform work must be tracked as a separate documentation/planning track until its implementation backlog is explicitly created.
Claim exactly one READY task, honour all dependencies and allowed paths, and move completed work only to REVIEW.
