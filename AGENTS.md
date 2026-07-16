# Bank System - Repository Rules

## Stable project boundary

- Product: “复兴”智能数字银行 and “衡准”自动化回归测试平台.
- Stack: Java 21 / Spring Boot / React TypeScript Vite / PostgreSQL（既有银行核心）/ SQLite（回归平台及后续本机新增组件）/ Keycloak / ActiveMQ / Docker.
- Current capability claims must be verified against `docs/current-state/capability-matrix.md`, tests, contracts, and live runtime evidence.
- Target designs and historical plans must never be described as implemented without evidence.

## Mandatory banking rules

1. Fineract is the sole core banking truth source. Never write directly to `fineract_default` or `fineract_tenants`.
2. Browser clients call Gateway -> Bank Channel Service -> Fineract Adapter -> Fineract API; they never call Fineract directly.
3. Money writes require idempotency, correlation ID, state machine, optimistic locking, outbox, audit chain, accounting assertion, reconciliation, compensation, and replay evidence.
4. Money uses `BigDecimal` / `NUMERIC(19,2)` and an explicit JSON decimal representation, never binary floating point.
5. Database schema changes use Liquibase.
6. Container images use immutable SHA-256 digests, never `latest`.
7. Test Support API is restricted to `local`/`test` profiles and `ROLE_TEST_SUPPORT`.
8. AI authoring is separate from formal regression execution. Validated scripts, not LLM calls, drive scheduled runs.
9. SQLite is the default and sole database engine for new local Harness/衡准/平台领域 persistence. Existing Fineract/Mifos and bank-channel PostgreSQL stores remain core-owned compatibility dependencies; they must not be converted or written by the platform.

## Security and repository hygiene

- Do not read, print, commit, or index `.env`, secrets, API keys, credentials, Cookie, Token, Storage State, real PII, database volumes, logs, runs, caches, worker output, or local deliverables.
- Preserve unrelated work in a dirty tree. Stage explicit intended paths only.
- Do not auto-merge, force-push, or delete unknown runtime processes.
- External model calls receive only minimum redacted context and never receive execution tools or runtime credentials.

## Knowledge and task control

- `docs/` and the repository `rag/` are reviewed development knowledge for maintainers and Codex; they are not runtime knowledge sources for the delivered product.
- `documents/` is the controlled catalog and source boundary for formal project documents. Generated DOCX/PDF outputs stay in ignored `deliverables/`; formal documents cannot redefine implementation order or current capability.
- Coze Knowledge Base is the delivered regression Agent's sole runtime knowledge authority. Runtime Coze, Harness, Midscene and 衡准 must not retrieve from, synchronize with, or fall back to repository `docs/` or `rag/`.
- `contracts/` is the executable interface/data contract source.
- `rag/index/` is generated and disposable; edit `rag/config/` or source documents instead.
- `agent/backlog.yaml` is the only task-status source. `agent/runs/` is disposable runtime state.
- `agent/plans/active/v54-implementation-batches.md` is the only implementation-order source. The internship delivery prioritizes the Coze/Harness regression platform; platform foundations start immediately, while bank frontend work is limited to per-case readiness and does not act as a global prerequisite.
- All other files are auxiliary to implementation order and may define only parameters, interfaces, architecture, technical choices, code-level design, verification methods, or evidence.
- Stable decisions use ADRs. Active plans live in `agent/plans/active/`; accepted evidence lives in `docs/evidence/`.
- Follow nested `AGENTS.md` files for `apps/`, `services/`, `contracts/`, and `tests/`.

## Required verification

Run checks proportional to changed scope:

- Docs/RAG: `python scripts/docs/validate_docs.py`, `python scripts/rag/build_rag.py`, `python scripts/rag/validate_rag.py`.
- Java service: `services/bank-channel-service/mvnw.cmd test` with Java 21.
- Frontend: `npm.cmd run build` and relevant tests in each changed app/package.
- Contracts: validate JSON/OpenAPI plus producer/consumer contract tests.
- Money or release changes: relevant integration, financial E2E, reconciliation, security, Docker Smoke, and rollback verification.

Do not mark a task `DONE` until its acceptance evidence is reviewed. If a required check cannot run, record the exact cause and residual risk.
