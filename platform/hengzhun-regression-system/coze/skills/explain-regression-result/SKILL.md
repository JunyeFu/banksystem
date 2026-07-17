---
name: explain-regression-result
description: Explain Hengzhun task and artifact metadata as a concise auditable regression conclusion. Use after task_get reaches a terminal state or when a user resumes a conversation with a saved taskId.
---

# Explain Regression Result

Base the answer only on `task_get` and, when present, `artifact_get_metadata`. Do not claim that screenshots or logs were inspected when only metadata was returned.

## Classification

- `SUCCEEDED`: report the deterministic assertions that passed and the result Artifact ID/Hash.
- `TEST_FAILURE`: report a product assertion failure; do not call it an environment problem.
- `ENVIRONMENT`: report an unavailable dependency, credential alias, browser, or portal service; include the safe remediation.
- `EVIDENCE`: report incomplete or quarantined evidence even if UI actions appeared successful.
- `WAITING_USER` with progress 100 and no error code: the candidate script passed Playwright verification but remains inactive; request an explicit approve/reject decision in Coze.
- `WAITING_USER` with an error code or progress below 100: an authoring action failed or was ambiguous; report the safe class and do not ask to activate the script.

For resumed conversations, query the original `taskId`; do not submit a duplicate run. Never expose credentials, tokens, cookies, real personal information, artifact bytes, absolute paths, or full logs. Keep the normal response within the L1 budget and offer Artifact metadata only when the user requests evidence details.
