---
id: DOC-ARCH-RF030-EVIDENCE
title: RF-030 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Evidence Index

## Baseline

- Source inspection confirms random fixture subjects and client external IDs, first-account selection, and ignored lifecycle exceptions.
- The accepted RF-027 clean-clone run provides only A02 INTEGRATION evidence; it does not prove a bank business path.
- RF-030 begins with no bank runtime, seed, transfer, browser, model, LIVE_E2E or release evidence in this campaign.
- A Java 17 `JAVA_HOME` failed before compilation; a new activity pinned the installed Temurin 21 runtime. The first full suite then exposed one existing outbox-event matcher defect, corrected to accept a distinct event UUID while retaining exact transfer and aggregate IDs.

## Closure (2026-09-03)

- Bank Channel Java 21 suite: `46/46`, failures `0`, errors `0`, skipped `0`.
- Test Support OpenAPI and v9 Liquibase YAML parse successfully; Channel Compose configuration and `git diff --check` pass.
- Refactoring governance: `REFACTOR_VALIDATION=PASS batches=1 modules=27`.
- Documentation governance: `DOC_VALIDATION=PASS metadata=440 links=169 stale_checks=3598 order_files=440 refactoring=True`.
- Fresh isolated Fineract and Channel integration passed: stable product, both customers and both savings accounts were reused on consecutive seed and after Bank Channel restart; the authenticated subject mapping remained identical across restart.
- Fineract readback confirmed exact CNY balances of `100000.00` and `50000.00`; no Fineract database write was used.
- Sanitized runtime evidence: `agent/runs/rf030/20260903-154500/integration-result.json`, SHA-256 `4354084f4a25e7966653fdde42c82f11ec961b61cff20680c2a3748cf5a2acf3`.
- Identity migration SHA-256: `5b21ed75dbd18448186f99c41fd4b865f1b2d922b9fc3cac0ce8cd91130ac22b`; Test Support contract SHA-256: `ed712377d60fe329ee3b19c4cd65439b2bda17afbeb64eecefbefd7a96ef0a94`.
- Ephemeral Keycloak subjects and the exact `rf030channel`/`rf030core` containers and volumes were removed after capture. The original projects remain stopped and their project volumes remain present.

RF-030 S1/S2 and RF-030 are closed. This proves A03-M01 only; transfer, portal, LIVE_E2E, Full18 and release remain unproven.
