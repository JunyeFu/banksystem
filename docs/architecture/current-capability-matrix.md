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
| Backup/restore | Yes | Temporary-target restore, 285 tables | VERIFIED |
| Loan application draft/submit | Yes | Channel API and `loan_application` schema | IMPLEMENTED_NOT_VERIFIED |
| Loan documents/checklist | Yes | Channel API and `loan_document` schema | IMPLEMENTED_NOT_VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Channel API and version/reason guards | IMPLEMENTED_NOT_VERIFIED |
| Loan core lifecycle/accounting | No | No controlled Fineract loan adapter yet | NOT_STARTED |
| EOD/reconciliation orchestration | Yes | Protected EOD endpoint and `eod_run` evidence | IMPLEMENTED_NOT_VERIFIED |
| Cashier/freeze/close/maturity operations | No | No implementation evidence yet | NOT_STARTED |
| Final full regression | No | E2E-001 to E2E-014 not all executed | NOT_STARTED |
