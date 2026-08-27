---
id: DOC-ARCH-RF023-EVIDENCE
title: RF-023 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-023 Evidence Index

Status: CLOSED on 2026-08-26 for OFFLINE engineering only. No process start/stop/reload, real endpoint request, formal session-root write, configured model freeze, publication or LIVE ledger mutation occurred.

- Offline integration: 4 tests passed. Real CurrentUser DPAPI encrypted the pending graph/proposal, a new store/runtime instance restored it, and exact approval caused one MCP mutation; rejection caused zero. An unexpected Flowise observation blocked before session creation.
- Agent CLI matrix: 38 tests passed across JSONL, TUI, lifecycle/v4 and offline production composition. Controller-focused matrix remained 52 passed.
- Executable smoke: credential-free `version` and real read-only `doctor` both exited 0 with JSONL-only stdout. Doctor observed Flowise absent and exact Node `v24.19.0`/`v20.20.2`; this is readiness, not service health.
- Supply chain: deterministic CycloneDX 1.5 SBOM contains 141 unique components and binds SHA-256 of the exact CLI/Controller lockfiles. Root, Controller and CLI live `npm audit --omit=dev --audit-level=high` each reported 0 vulnerabilities.
- Secret scan: 325 source files and 14,201 runtime-output files scanned, two protected environment values checked, 0 findings.
- Cold rollback drill: wrong authorization is refused; exact identity creates only `executionPerformed=false`, with normal profile disabled and evidence reuse false.
- Current source candidate: identity `45f1b93707f55ebe9a13e1fe6e23f0f565348b66b93b9c231d01e9abcd3ed60b`, code set `49bc6bc1c7adaa5b65b4675e6c06333054b659346a87b32b5dc010e0d4503ed7`, 118 governed files, status `SOURCE_FROZEN_UNBOUND`; it is not a publishable identity.
- Registered suite: 83 registered, 81 CI-runnable, two explicit governed media prerequisites excluded; 525 tests passed, 0 failed, and legacy release-state hashes remained unchanged.
- Stage9 report-only preflight: all runtime trees, governed source files and host tools are present; the shared dirty source returns `I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN`, with `exportCreated=false` and `archiveCreated=false`.
- Acceptance ledger remains historical `0/18`; synthetic tests do not promote any chain.
- Governance closure: RF-023 validator passed with 27 modules; enforced temporal validation reported 0 current contradictions; documentation validation passed with 363 metadata documents, 169 links and 2,968 stale checks; `git diff --check` exited 0 with line-ending warnings only.
