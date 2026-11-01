---
id: DOC-ARCH-RF035-EVIDENCE
title: RF-035 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-035 Evidence Index

## Closure (2026-09-03)

- Java 21 suite: 56/56 passed with zero failures, errors or skips.
- Lifecycle contract passed with `golden_path=api_only`.
- Fresh isolated Core and Channel executed the golden runner twice. Both returned `COMPLETED` with unique correlation and Fineract transaction IDs.
- Each exact correlation had one settled transfer and two balanced local ledger entries. Balances moved from 100000/50000 to 99800/50200 across two 100 CNY runs.
- Temporary Keycloak users, clients and non-fixture identity mappings were zero after cleanup. Historical beneficiary references were retained because settled transfers reference them.
- Sanitized evidence: `agent/runs/rf035/20260903-171200/integration-result.json`, SHA-256 `effb0c1309a7e396396dba6156d04b0bd673a359821acb768e0c5e89406f5b8d`.
- All `rf035-*` containers, volumes and networks were removed after capture; original project resources were not changed.

RF-035 proves the API orchestrator and root dispatch contract. A positive invocation through the root READY admission remains coupled to A05 service lifecycle verification; it is not a substitute for CLI LIVE_E2E.
