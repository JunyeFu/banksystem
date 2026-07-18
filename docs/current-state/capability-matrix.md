---
id: DOC-D3CCB3768E
title: Current capability matrix
document_type: reference
domain: current-state
status: verified
authority: evidence
version: 1.4
effective_date: 2026-07-16
owner: project-owner
---

# Current capability matrix

> This matrix describes banking-core implementation and accepted evidence, not automatic readiness of every newly created identity. A Keycloak user becomes a usable banking customer only after an explicit `customer_identity` link to a Fineract client exists. Historical synthetic-user E2E evidence does not prove that an independently created demo user is linked. It is not a completion claim for the v5.4 regression platform. The combined external-demo target and migration boundary are defined in [`../architecture/v5.4-external-demo-baseline.md`](../architecture/v5.4-external-demo-baseline.md).

| Capability | Implemented | Runtime evidence | Status |
|---|---:|---|---|
| Phase 0 baseline and backup | Yes | Hash, OpenAPI parse, restore drill | VERIFIED |
| Customer login and account query | Yes | Portal username/password form, customer Realm/Client and a temporary synthetic-user graphical smoke are proven; persistent demo credentials still need user-entered browser acceptance, explicit Fineract identity linking and restart re-verification. Phone-number login and session renewal are not yet verified | PARTIALLY_VERIFIED |
| Beneficiary tokenization | Yes | Authorized customer create/list returned masked `****7890`; temporary data removed | VERIFIED |
| Notifications | Yes | Customer transfer produced one subject-scoped `TRANSFER_SETTLED` notification | VERIFIED |
| Transfer receipts/statements | Yes | Repeatable customer E2E verifies JSON/PDF receipts, 64-digit SHA-256, CSV/PDF statements, balance equation, and identical statement replay | VERIFIED |
| Internal transfer | Yes | Customer-owned source enforcement (403), idempotency replay/409 conflict, successful core posting with receipt/notification, insufficient-funds `FAILED`, and checker-approved `COMPENSATED` reversal | VERIFIED |
| Mock clearing | Yes | Authorized E2E runner passed SUCCESS, TIMEOUT, DUPLICATE, OUT_OF_ORDER and RETURNED with signed callbacks; compensation uses reversal workflow | VERIFIED |
| Risk/Maker-Checker | Yes | REVIEW decision, maker self-check 409, independent PAYMENT_APPROVER ALLOW | VERIFIED |
| Operations Web | Yes | `/ops/` HTTP 200; role user allowed and no-role user denied on risk API | VERIFIED |
| Monitoring alerts | Yes | Authorized endpoint surfaced OUTBOX_BACKLOG P2, RECONCILIATION_DIFFERENCE P1 and DLQ_NON_EMPTY P1; core outage branch is implemented | VERIFIED |
| Backup/restore | Yes | Core temporary-target restore (285 tables) and channel temporary-target restore (12 tables) | VERIFIED |
| Loan application draft/submit | Yes | Authorized customer draft-to-submit path passed in scoring/Maker-Checker E2E | VERIFIED |
| Loan documents/checklist | Yes | Authorized customer upload/list returned one `ID_CARD` document with `RECEIVED` status; temporary data removed | VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Authorized LOAN_OFFICER score=99; maker self-check 409; independent LOAN_APPROVER approved | VERIFIED |
| Loan core lifecycle/accounting | Partial | Authorized submit/approve/disburse/repayment/close path passed; Fineract reported Closed (obligations met) and zero outstanding; maturity scenario passed | PARTIALLY_VERIFIED |
| EOD/reconciliation orchestration | Yes | Authorized EOD plus all three reconciliation types returned MATCHED with zero differences and balanced debit/credit totals | VERIFIED |
| Cashier/freeze/close/maturity operations | Partial | Authorized cashier read, block/unblock, business-date move/restore, one-period maturity schedule, post-maturity close, and premature-close HTTP 409 passed | PARTIALLY_VERIFIED |
| Final full regression | Partial | Repeatable smoke regression and backup drills pass; E2E-001 to E2E-014 are not all automated/executed | PARTIALLY_VERIFIED |
| Local identity-data readiness | Partial | Keycloak persistence and default `CUSTOMER` role are configured; each persistent demo customer still requires enabled/no-required-action checks, a unique Fineract client link and credential-private graphical acceptance | PARTIALLY_VERIFIED |

Customer graphical password-login qualification and its local-demo/production boundary are detailed in [`../evidence/frontend/customer-password-login-gap-2026-07-16.md`](../evidence/frontend/customer-password-login-gap-2026-07-16.md).

## v5.4 regression-platform target status

| Capability | Current status | Evidence/qualification |
|---|---|---|
| Dedicated Node/Playwright/Midscene runtime | VERIFIED | `platform/hengzhun-regression-system/runtime` now contains the product-local verified copy of Node 20.20.2, Playwright/Test/Core 1.59.1, Midscene Web/CLI 1.10.5, Chromium revision 1217 and FFmpeg revision 1011; legacy `platform/runtime` is retained temporarily as rollback source |
| Hengzhun single-directory product skeleton | VERIFIED | Product root, module boundaries, `.data` isolation, fixed runtime, Harness, Worker, Model Gateway, OpenAPI, Coze public configuration and I1—I7 verifier are present and pass |
| RegressionCase, Fixture, Baseline and human-success evidence | VERIFIED | I4 三条低风险案例使用独立 BrowserContext、Fixture 隔离和脱敏证据通过；正式脚本需 `SCRIPT_VALIDATED` |
| Repository development RAG | VERIFIED / DEVELOPMENT_ONLY | 开发 RAG 可重复构建与验证；它不属于交付系统运行时知识源 |
| Coze runtime knowledge base | VERIFIED_FOR_DEMO | I3/I4/I6 的 Knowledge Base 已经公开绑定并完成自动/全文检索与真实命中；长期失效与权限治理仍由 GAP-008 跟踪 |
| Coze Agent orchestration plus Harness tools | VERIFIED_FOR_DEMO | Coze 公开 Agent 已完成 I3 执行、I5 人工激活及 I6 自然语言调度闭环；Harness v0.0.10 共 14 个工具 |
| Midscene visual Agent plus Playwright fact collection | PARTIALLY_VERIFIED_WITH_FALLBACK | `INPUT/TAP/SCROLL` 通过五视口门禁；`LOCATE` 降级并强制 Playwright-only，所有事实仍由 Playwright 独立验证 |
| Independent Playwright script validation | VERIFIED | 三案例脚本、隔离 Worker、独立 BrowserContext、断言和证据 Hash 已通过，未验证脚本不能正式执行 |
| Scheduled regression and automatic failure pause | VERIFIED | I6 验证互斥、misfire、补跑、重启去重、有限重试、最终失败暂停和人工恢复；正式调度不调用模型 |
| Reverse recovery with exactly two options | VERIFIED | 修复候选与 Schedule 恢复均由 Harness 保持版本化状态并要求 Coze 用户显式二选一，旧版本重复决策被拒绝 |
| Hengzhun observability frontend | DEFERRED | Legacy UI assets and browser fixtures exist but are outside the approved read-only boundary; they are not current capability evidence and must not be extended until `HZ-OBSERVABILITY-001` is resumed |
