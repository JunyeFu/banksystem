---
id: DOC-ARCH-RF023-CONTRACT
title: RF-023 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-023 Contract Delta

Add `createProductionService` as the CLI-to-Controller v2 composition boundary and `createEnvironmentProductionService` as its explicit, fail-closed configuration adapter. The CLI executable now lazily binds this service for mutating and session commands while `version` and read-only `doctor` remain credential-free. Add a deterministic CycloneDX 1.5 SBOM bound to exact CLI and Controller lock hashes. Add a pure cold-rollback plan that proves exact separate authorization but never executes it.

