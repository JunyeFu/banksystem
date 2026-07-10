# Current capability matrix

| Capability | Implemented | Runtime evidence | Status |
|---|---:|---|---|
| Phase 0 baseline and backup | Yes | Hash, OpenAPI parse, restore drill | VERIFIED |
| Customer login and account query | Yes | Keycloak discovery, Customer Web 200, API 401 without token | PARTIALLY_VERIFIED |
| Beneficiary tokenization | Yes | Channel schema and controller | IMPLEMENTED_NOT_VERIFIED |
| Notifications | Partial | Customer-scoped notification table and transfer-settled notification producer | IMPLEMENTED_NOT_VERIFIED |
| Transfer receipts/statements | Partial | Customer-scoped receipt payload/SHA-256 plus authorized CSV and PDF statement responses; full document reconciliation remains | PARTIALLY_VERIFIED |
| Internal transfer | Yes | Fineract reference 3, channel POSTED, replay same ID | VERIFIED |
| Mock clearing | Yes | Deterministic runner and signed callback code | IMPLEMENTED_NOT_VERIFIED |
| Risk/Maker-Checker | Yes | Deterministic rules and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Operations Web | Yes | `/ops/` HTTP 200; role user allowed and no-role user denied on risk API | VERIFIED |
| Monitoring alerts | Yes | Protected alert endpoint | IMPLEMENTED_NOT_VERIFIED |
| Backup/restore | Yes | Core temporary-target restore (285 tables) and channel temporary-target restore (12 tables) | VERIFIED |
| Loan application draft/submit | Yes | Channel API and `loan_application` schema | IMPLEMENTED_NOT_VERIFIED |
| Loan documents/checklist | Yes | Channel API and `loan_document` schema | IMPLEMENTED_NOT_VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Channel API and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Loan core lifecycle/accounting | Partial | Authorized submit/approve/disburse/repayment/close path passed; Fineract reported Closed (obligations met) and zero outstanding; maturity/time-travel regression remains | PARTIALLY_VERIFIED |
| EOD/reconciliation orchestration | Partial | Protected EOD endpoint plus three reconciliation runs; `CORE_TO_GENERAL_LEDGER` now verifies debit/credit equality, while full clearing settlement coverage remains | PARTIALLY_VERIFIED |
| Cashier/freeze/close/maturity operations | Partial | Authorized cashier read, block/unblock, business-date move/restore, one-period maturity schedule, and post-maturity close passed; prematureClose remains | PARTIALLY_VERIFIED |
| Final full regression | No | E2E-001 to E2E-014 not all executed | NOT_STARTED |
