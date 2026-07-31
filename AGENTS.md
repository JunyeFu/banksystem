# Bank System - Repository Rules

## Stable project boundary

- Product: “复兴”智能数字银行 and “衡准”自动化回归测试平台.
- Stack: Java 21 / Spring Boot / React TypeScript Vite / PostgreSQL（既有银行核心）/ SQLite（回归平台及后续本机新增组件）/ Keycloak / ActiveMQ / Docker.
- Current delivery boundary: preserve the completed I0-I7 Coze demonstration as historical evidence and implement I8 with Windows-native Flowise 3.0.12, MCP, Harness, Midscene and Playwright. HiAgent remains the test-environment target; Flowise may use only capabilities with evidenced HiAgent equivalents, and local success must never be claimed as HiAgent success.
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
- I10 separates model budgets: the visual LLM has a governed 16,000-token request window (at most 12,000 input and 4,000 reserved output), while the controller profile requires up to 1,000,000 context tokens and at most 8,192 output tokens. MiMo v2.5 may use only the Qwen3.5-compatible message/image/JSON protocol; a future intranet Qwen3.5 endpoint must pass the exact-checkpoint/backend/HiAgent capability gate and may not be silently downgraded or adapter-clamped below its declared capacity. Capacity is not authorization: both models receive only the minimum governed `CTX-L1/CTX-L2/CTX-L3` dependency cone, never the whole repository, database, conversation history, secrets or unrelated cases.

## Knowledge and task control

- `docs/` and the repository `rag/` are reviewed development knowledge for maintainers and Codex; they are not runtime knowledge sources for the delivered product.
- `documents/` is the controlled catalog and source boundary for formal project documents. Generated DOCX/PDF outputs stay in ignored `deliverables/`; formal documents cannot redefine implementation order or current capability.
- Flowise platform knowledge is the personal/office-computer runtime semantic authority; the test environment rebuilds the same governed source set in HiAgent Knowledge. Harness `regression_platform.sqlite` is the sole structured execution and regression-state authority. Neither runtime may retrieve from, synchronize with, or fall back to repository `docs/` or `rag/`.
- `contracts/` is the executable interface/data contract source.
- `rag/index/` is generated and disposable; edit `rag/config/` or source documents instead.
- `agent/backlog.yaml` is the only task-status source. `agent/runs/` is disposable runtime state.
- `agent/plans/active/v54-implementation-batches.md` is the only implementation-order source. I0-I7 are frozen Coze/Harness history, I8 is the closed deterministic engine, I9 is the frozen Flowise baseline, and I10 is the only current formal-portable implementation stage. Bank frontend work remains limited to per-case readiness and is not a global prerequisite.
- Local Coze evidence proves only the historical demonstration. Flowise probe or I8 evidence proves only the personal/office-computer stage. HiAgent-facing Workflow/Knowledge/MCP/configuration/runbook artifacts are handoff inputs, not proof of HiAgent installation, network reachability or runtime readiness. `PLAT-V007` and `PLAT-V010` remain test-environment gates and do not reopen I1-I7.
- All other files are auxiliary to implementation order and may define only parameters, interfaces, architecture, technical choices, code-level design, verification methods, or evidence.
- Stable decisions use ADRs. Active plans live in `agent/plans/active/`; accepted evidence lives in `docs/evidence/`.
- Follow nested `AGENTS.md` files for `apps/`, `services/`, `contracts/`, and `tests/`.

## Required verification

Run checks proportional to changed scope:

- Docs: always run `python scripts/docs/validate_docs.py`. Development RAG is optional and product-external; run `python scripts/rag/build_rag.py` and `python scripts/rag/validate_rag.py` only when `rag/config`, `rag/eval`, indexed sources or development retrieval behavior changed, or when a development index is explicitly required.
- Java service: `services/bank-channel-service/mvnw.cmd test` with Java 21.
- Frontend: `npm.cmd run build` and relevant tests in each changed app/package.
- Contracts: validate JSON/OpenAPI plus producer/consumer contract tests.
- Money or release changes: relevant integration, financial E2E, reconciliation, security, Docker Smoke, and rollback verification.

Do not mark a task `DONE` until its acceptance evidence is reviewed. If a required check cannot run, record the exact cause and residual risk.
