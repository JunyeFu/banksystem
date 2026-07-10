# Current capability matrix

| Capability | Implemented | Runtime evidence | Status |
|---|---:|---|---|
| Phase 0 baseline and backup | Yes | Hash, OpenAPI parse, restore drill | VERIFIED |
| Customer login and account query | Yes | Keycloak discovery, Customer Web 200, API 401 without token | PARTIALLY_VERIFIED |
| Beneficiary tokenization | Yes | Authorized customer create/list returned masked `****7890`; temporary data removed | VERIFIED |
| Notifications | Partial | Customer-scoped notification table and transfer-settled notification producer | IMPLEMENTED_NOT_VERIFIED |
| Transfer receipts/statements | Partial | Customer-scoped receipt payload/SHA-256 plus authorized CSV and PDF statement responses; full document reconciliation remains | PARTIALLY_VERIFIED |
| Internal transfer | Yes | Fineract reference 3, channel POSTED, replay same ID | VERIFIED |
| Mock clearing | Yes | Authorized E2E runner passed SUCCESS, TIMEOUT, DUPLICATE and OUT_OF_ORDER with signed callbacks | VERIFIED |
| Risk/Maker-Checker | Yes | Deterministic rules and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Operations Web | Yes | `/ops/` HTTP 200; role user allowed and no-role user denied on risk API | VERIFIED |
| Monitoring alerts | Yes | Authorized monitoring endpoint returned 200 and surfaced OUTBOX_BACKLOG P2 | VERIFIED |
| Backup/restore | Yes | Core temporary-target restore (285 tables) and channel temporary-target restore (12 tables) | VERIFIED |
| Loan application draft/submit | Yes | Channel API and `loan_application` schema | IMPLEMENTED_NOT_VERIFIED |
| Loan documents/checklist | Yes | Authorized customer upload/list returned one `ID_CARD` document with `RECEIVED` status; temporary data removed | VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Channel API and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Loan core lifecycle/accounting | Partial | Authorized submit/approve/disburse/repayment/close path passed; Fineract reported Closed (obligations met) and zero outstanding; maturity/time-travel regression remains | PARTIALLY_VERIFIED |
| EOD/reconciliation orchestration | Partial | Protected EOD endpoint plus three reconciliation runs; `CORE_TO_GENERAL_LEDGER` now verifies debit/credit equality, while full clearing settlement coverage remains | PARTIALLY_VERIFIED |
| Cashier/freeze/close/maturity operations | Partial | Authorized cashier read, block/unblock, business-date move/restore, one-period maturity schedule, and post-maturity close passed; prematureClose remains | PARTIALLY_VERIFIED |
| Final full regression | Partial | Repeatable smoke regression and backup drills pass; E2E-001 to E2E-014 are not all automated/executed | PARTIALLY_VERIFIED |
