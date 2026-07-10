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
| Loans, EOD, reconciliation automation, final regression | No | No implementation evidence yet | NOT_STARTED |
