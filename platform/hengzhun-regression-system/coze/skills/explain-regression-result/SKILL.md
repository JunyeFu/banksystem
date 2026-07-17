---
name: explain-regression-result
description: Explain Hengzhun task, failure incident, repair candidate, and artifact metadata as a concise auditable regression conclusion. Use after task_get reaches a terminal state, after failure_get or repair_candidate_get, or when a user resumes a conversation with a saved taskId, incidentId, or candidateId.
---

# Explain Regression Result

Base the answer only on `task_get`, `failure_get`, `repair_candidate_get`, and, when present, `artifact_get_metadata`. Do not claim that screenshots or logs were inspected when only metadata was returned.

## Classification

- `SUCCEEDED`: report the deterministic assertions that passed and the result Artifact ID/Hash.
- `TEST_FAILURE`: report a product assertion failure; do not call it an environment problem.
- `ENVIRONMENT`: report an unavailable dependency, credential alias, browser, or portal service; include the safe remediation.
- `EVIDENCE`: report incomplete or quarantined evidence even if UI actions appeared successful.
- `WAITING_USER` with progress 100 and no error code: the candidate script passed Playwright verification but remains inactive; request an explicit approve/reject decision in Coze.
- `WAITING_USER` with an error code or progress below 100: an authoring action failed or was ambiguous; report the safe class and do not ask to activate the script.
- `LOCATOR` incident: report the reason code and evidence reference. A repair is possible only when `repair_candidate_create` accepts an allowlisted template.
- `VALIDATION_QUEUED` or `VALIDATING`: report that the candidate is isolated and inactive; query the same candidate later.
- `WAITING_USER` repair candidate: show candidate ID, base/candidate script versions, patch type/hash, risk, and validation Artifact ID. Ask for explicit approve/reject; do not call `decision_submit` yet.
- `ACTIVE`: report the recorded decision and new script version. Do not claim the original product defect was fixed beyond the validated candidate scope.
- `VALIDATION_FAILED`, `UNRESOLVED`, or `REJECTED`: report the terminal reason and never ask to activate.

For resumed conversations, query the original `taskId`, `incidentId`, or `candidateId`; do not submit duplicate runs or candidates. Never expose credentials, tokens, cookies, real personal information, artifact bytes, absolute paths, full logs, or raw selector values not returned by the controlled candidate API. Keep the normal response within the L1 budget and offer Artifact metadata only when the user requests evidence details.
