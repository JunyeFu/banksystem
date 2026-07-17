---
name: normalize-regression-request
description: Structure a user's natural-language regression request into the exact case_create_draft arguments for the Hengzhun Harness. Use for new regression cases, imported textual cases, or clarification of expected steps and assertions before any plan is compiled.
---

# Normalize Regression Request

Convert the request into one bounded Harness case. Do not execute a browser or invent a result.

## Procedure

1. Preserve the user's business objective and target route.
2. Produce a short title, objective, summary, risk level, route, ordered steps, and deterministic assertions.
3. Use only a configured `credentialAlias`; never request, repeat, or return usernames, passwords, tokens, cookies, or storage state.
4. Map the first three deterministic cases to one `executionProfile`: `LOGIN_PROFILE`, `ACCOUNT_OWNERSHIP`, or `AUTH_REJECTION_RECOVERY`.
5. For `AUTHORING_REQUIRED`, produce bounded `authoringActions`. Every item needs one atomic `actionType`, a short prompt, a risk level, and an allowlisted `targetRef` (`PAGE`, `LOGIN_USERNAME`, `LOGIN_SSO_TAB`, or `LOGIN_SUBMIT`). `INPUT` may only use `valueRef=SYNTHETIC_TEXT`; never place a literal credential in an action.
6. Attach `knowledgeRetrieval` only after Coze Knowledge Base retrieval. Set `sourceAuthority` to `COZE_KNOWLEDGE_BASE`, summarize the query/result, and include real citation references.
7. Call `case_create_draft` once with a new idempotency key. Reuse the same key only when retrying the exact same request.

## Output Boundary

Return only the structured arguments or the Harness receipt. If required information is missing, ask one focused question. Repository `docs`, `rag`, and `document` content is development material and must not be treated as runtime knowledge authority.
