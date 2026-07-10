# Current capability matrix

| Capability | Implemented | Runtime evidence | Status |
|---|---:|---|---|
| Phase 0 baseline and backup | Yes | Hash, OpenAPI parse, restore drill | VERIFIED |
| Customer login and account query | Yes | Keycloak discovery, Customer Web 200, API 401 without token | PARTIALLY_VERIFIED |
| Beneficiary tokenization | Yes | Channel schema and controller | IMPLEMENTED_NOT_VERIFIED |
| Internal transfer | Yes | Fineract reference 3, channel POSTED, replay same ID | VERIFIED |
| Mock clearing | Yes | Deterministic runner and signed callback code | IMPLEMENTED_NOT_VERIFIED |
| Risk/Maker-Checker | Yes | Deterministic rules and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Operations Web | Yes | `/ops/` HTTP 200 | PARTIALLY_VERIFIED |
| Monitoring alerts | Yes | Protected alert endpoint | IMPLEMENTED_NOT_VERIFIED |
| Backup/restore | Yes | Core temporary-target restore (285 tables) and channel temporary-target restore (12 tables) | VERIFIED |
| Loan application draft/submit | Yes | Channel API and `loan_application` schema | IMPLEMENTED_NOT_VERIFIED |
| Loan documents/checklist | Yes | Channel API and `loan_document` schema | IMPLEMENTED_NOT_VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Channel API and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Loan core lifecycle/accounting | Partial | Controlled Fineract submit/approve/disburse/repayment adapter and authorized E2E are implemented; closure and reconciliation regression remain | PARTIALLY_VERIFIED |
| EOD/reconciliation orchestration | Yes | Protected EOD endpoint and `eod_run` evidence | IMPLEMENTED_NOT_VERIFIED |
| Cashier/freeze/close/maturity operations | Partial | Authorized cashier read and block/unblock E2E passed; close/prematureClose and maturity scenarios remain unexecuted to preserve fixtures | PARTIALLY_VERIFIED |
| Final full regression | No | E2E-001 to E2E-014 not all executed | NOT_STARTED |
