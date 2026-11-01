# Bank System - Repository Rules

## Stable project boundary

- Product: “复兴”智能数字银行 and “衡准”自动化回归测试平台.
- Stack: Java 21 / Spring Boot / React TypeScript Vite / PostgreSQL（既有银行核心）/ SQLite（回归平台及后续本机新增组件）/ Keycloak / ActiveMQ / Docker.
- Current delivery boundary: preserve Coze/Flowise/HiAgent work as historical evidence and deliver a reproducible open-source bank demo plus the Windows-native `hz-agent` CLI, independent MCP, Harness, Midscene and Playwright. Flowise is not a shipped runtime, startup dependency, fallback or release gate.
- Current capability claims must be verified against `docs/current-state/capability-matrix.md`, tests, contracts, and live runtime evidence.
- Target designs and historical plans must never be described as implemented without evidence.

## Mandatory banking rules

1. Fineract is the sole core banking truth source. Never write directly to `fineract_default` or `fineract_tenants`.
2. Browser clients call Gateway -> Bank Channel Service -> Fineract capability ports -> Fineract API; they never call Fineract directly.
3. Money writes require idempotency, correlation ID, state machine, optimistic locking, outbox, audit chain, accounting assertion, reconciliation, compensation, and replay evidence.
4. Money uses `BigDecimal` / `NUMERIC(19,2)` and an explicit JSON decimal representation, never binary floating point.
5. Database schema changes use Liquibase.
6. Container images use immutable SHA-256 digests, never `latest`.
7. Test Support API is restricted to `local`/`test` profiles and `ROLE_TEST_SUPPORT`.
8. AI authoring is separate from formal regression execution. Validated scripts, not LLM calls, drive scheduled runs.
9. SQLite is the default and sole database engine for new local Harness/衡准/平台领域 persistence. Existing Fineract/Mifos and bank-channel PostgreSQL stores remain core-owned compatibility dependencies; they must not be converted or written by the platform.

## Security and repository hygiene

- Do not print, commit, index, or broadly inspect secrets, credentials, Cookie, Token, Storage State, real PII or database volumes. For authorized diagnosis, trusted local helpers may load configuration internally and extract the minimum redacted fields from the named failed run/log/SDK report. Never return secret values, raw authentication material, unrelated runs or unfiltered dumps to the model or user.
- Preserve unrelated work in a dirty tree. Stage explicit intended paths only.
- Do not auto-merge, force-push, or delete unknown runtime processes.
- External model calls receive only minimum redacted context and never receive execution tools or runtime credentials.
- I10 separates model budgets: the visual LLM has a governed 16,000-token request window (at most 12,000 input and 4,000 reserved output), while the controller profile requires up to 1,000,000 context tokens and at most 8,192 output tokens. MiMo v2.5 may use only the Qwen3.5-compatible message/image/JSON protocol; a future intranet Qwen3.5 endpoint must pass the exact-checkpoint/backend/HiAgent capability gate and may not be silently downgraded or adapter-clamped below its declared capacity. Capacity is not authorization: both models receive only the minimum governed `CTX-L1/CTX-L2/CTX-L3` dependency cone, never the whole repository, database, conversation history, secrets or unrelated cases.

## Knowledge and task control

- `docs/` and the repository `rag/` are reviewed development knowledge for maintainers and Codex; they are not runtime knowledge sources for the delivered product.
- `documents/` is the controlled catalog and source boundary for formal project documents. Generated DOCX/PDF outputs stay in ignored `deliverables/`; formal documents cannot redefine implementation order or current capability.
- The CLI controller receives only the minimum governed context required for the current Journey. Harness `regression_platform.sqlite` is the sole structured execution and regression-state authority. The delivered product must not retrieve from, synchronize with, or fall back to repository `docs/` or `rag/` at runtime.
- `contracts/` is the executable interface/data contract source.
- `rag/index/` is generated and disposable; edit `rag/config/` or source documents instead.
- `agent/backlog.yaml` is the only task-status source. `agent/runs/` holds runtime/evidence outputs: retain necessary acceptance and failure evidence, and only isolate confirmed superseded, reproducible outputs during authorized closeout.
- `agent/plans/active/v54-implementation-batches.md` is the only implementation-order source. I0-I7 are frozen Coze/Harness history, I8 is the closed deterministic engine, I9 is frozen Flowise history, and the current product sequence is the A01-A08 open-source bank plus CLI Agent portfolio. Historical completion does not authorize a Flowise runtime path.
- Local Coze evidence proves only the historical demonstration. Flowise probe or I8 evidence proves only the personal/office-computer stage. HiAgent-facing Workflow/Knowledge/MCP/configuration/runbook artifacts are handoff inputs, not proof of HiAgent installation, network reachability or runtime readiness. `PLAT-V007` and `PLAT-V010` remain test-environment gates and do not reopen I1-I7.
- All other files are auxiliary to implementation order and may define only parameters, interfaces, architecture, technical choices, code-level design, verification methods, or evidence.
- Stable decisions use ADRs. Active plans live in `agent/plans/active/`; accepted evidence lives in `docs/evidence/`.
- Follow nested `AGENTS.md` files for `apps/`, `services/`, `contracts/`, and `tests/`.

## Refactoring execution interlock

- Keep the direction-refinement chain — order → batch → slice → task package — sufficient for the authorized work. When the user has authorized autonomous refinement, implementation or fixes, complete missing records and necessary path declarations yourself and proceed within that scope; do not demand another approval or a switch to plan mode. Ask only when a material decision or action exceeds the user's authority already given, especially bank-state changes, new external publication or unknown ownership. Preserve required correctness checks and record actual evidence before completion.
- Existing task-level authorization persists across necessary source fixes, candidate identity regeneration and owned Agent reloads within the same stated environment/action scope. ReleaseIdentity must still be recomputed and bound to the actual candidate; authorization does not make stale evidence valid. A tool-level policy rejection is external to this repository: report it and do not disable or evade the tool's controls.
- Normative source: `docs/architecture/refactoring-control-process-v1.md` section `RC-D0 方向细化前置门禁`.

## Local storage closeout

- Reuse existing scratch/output locations. At batch or milestone closeout, inspect only newly produced artifacts; do not start repeated whole-tree scans or new experiments for cleanup.
- Keep source/human edits, locks, current dependencies, necessary frozen inputs/recovery points, final deliveries, and evidence supporting successes and key failures. Archive cold raw logs/responses/traces losslessly when useful; verify readability before replacing plaintext. Stop accumulating duplicate full logs, screenshots, ZIPs and clones.
- Never move live services/data, credentials, `.git`, linked objects, shared caches or Codex internal state. For authorized, inactive project-exclusive copies, use one same-volume quarantine: `<drive>\_Codex待人工删除\banksystem\<batch>\<original-relative-path>`; do not overwrite, permanently delete, clean/prune/purge, or treat ignored/old/large as disposable.
- Keep one brief closeout inventory. Distinguish archive size, quarantined bytes and actual reclaimed space: same-volume isolation reclaims zero bytes. No resident cleanup monitor or extra test/report system.

## Required verification

Run checks proportional to changed scope:

- Docs: always run `python scripts/docs/validate_docs.py`. Development RAG is optional and product-external; run `python scripts/rag/build_rag.py` and `python scripts/rag/validate_rag.py` only when `rag/config`, `rag/eval`, indexed sources or development retrieval behavior changed, or when a development index is explicitly required.
- Java service: `services/bank-channel-service/mvnw.cmd test` with Java 21.
- Frontend: `npm.cmd run build` and relevant tests in each changed app/package.
- Contracts: validate JSON/OpenAPI plus producer/consumer contract tests.
- Money or release changes: relevant integration, financial E2E, reconciliation, security, Docker Smoke, and rollback verification.

Do not mark a task `DONE` until its acceptance evidence is reviewed. If a required check cannot run, record the exact cause and residual risk.
