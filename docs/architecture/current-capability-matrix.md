# Current capability matrix

| Capability | Implemented | Runtime evidence | Status |
|---|---:|---|---|
| Phase 0 baseline and backup | Yes | Hash, OpenAPI parse, restore drill | VERIFIED |
| Customer login and account query | Yes | Authorized customer profile/account E2E, Gateway-only Customer Web, API 401 without token | VERIFIED |
| Beneficiary tokenization | Yes | Authorized customer create/list returned masked `****7890`; temporary data removed | VERIFIED |
| Notifications | Yes | Customer transfer produced one subject-scoped `TRANSFER_SETTLED` notification | VERIFIED |
| Transfer receipts/statements | Yes | Repeatable customer E2E verifies JSON/PDF receipts, 64-digit SHA-256, CSV/PDF statements, balance equation, and identical statement replay | VERIFIED |
| Internal transfer | Yes | Customer-owned source enforcement (403), successful Fineract posting with receipt/notification, insufficient-funds `FAILED`, and checker-approved `COMPENSATED` reversal | VERIFIED |
| Mock clearing | Yes | Authorized E2E runner passed SUCCESS, TIMEOUT, DUPLICATE and OUT_OF_ORDER with signed callbacks | VERIFIED |
| Risk/Maker-Checker | Yes | REVIEW decision, maker self-check 409, independent PAYMENT_APPROVER ALLOW | VERIFIED |
| Operations Web | Yes | `/ops/` HTTP 200; role user allowed and no-role user denied on risk API | VERIFIED |
| Monitoring alerts | Yes | Authorized endpoint surfaced OUTBOX_BACKLOG P2, RECONCILIATION_DIFFERENCE P1 and DLQ_NON_EMPTY P1; core outage branch is implemented | VERIFIED |
| Backup/restore | Yes | Core temporary-target restore (285 tables) and channel temporary-target restore (12 tables) | VERIFIED |
| Loan application draft/submit | Yes | Authorized customer draft-to-submit path passed in scoring/Maker-Checker E2E | VERIFIED |
| Loan documents/checklist | Yes | Authorized customer upload/list returned one `ID_CARD` document with `RECEIVED` status; temporary data removed | VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Authorized LOAN_OFFICER score=99; maker self-check 409; independent LOAN_APPROVER approved | VERIFIED |
| Loan core lifecycle/accounting | Partial | Authorized submit/approve/disburse/repayment/close path passed; Fineract reported Closed (obligations met) and zero outstanding; maturity scenario passed | PARTIALLY_VERIFIED |
| EOD/reconciliation orchestration | Partial | Protected EOD endpoint plus three reconciliation runs; `CORE_TO_GENERAL_LEDGER` now verifies debit/credit equality, while full clearing settlement coverage remains | PARTIALLY_VERIFIED |
| Cashier/freeze/close/maturity operations | Partial | Authorized cashier read, block/unblock, business-date move/restore, one-period maturity schedule, post-maturity close, and premature-close HTTP 409 passed | PARTIALLY_VERIFIED |
| Final full regression | Partial | Repeatable smoke regression and backup drills pass; E2E-001 to E2E-014 are not all automated/executed | PARTIALLY_VERIFIED |
