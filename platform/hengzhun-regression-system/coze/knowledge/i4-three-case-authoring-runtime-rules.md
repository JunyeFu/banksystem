# I4 three-case and authoring runtime rules

This file is an auditable import source. Only the processed Coze Knowledge Base copy is runtime knowledge authority.

## Deterministic cases

1. `LOGIN_PROFILE`: password login, non-empty header identity, equal header/profile name, and avatar/name consistency.
2. `ACCOUNT_OWNERSHIP`: every detail opened by the case belongs to the authenticated customer's account list; an impossible foreign identifier must fail safely.
3. `AUTH_REJECTION_RECOVERY`: wrong credentials are rejected, correct credentials recover, an expired in-memory session returns to login, and a second correct login recovers again.

Formal regression always uses `executionRoute=PLAYWRIGHT`. Harness binds only a checked-in `SCRIPT_VALIDATED` script. Every run uses an independent BrowserContext, a unique fixture namespace, and redacted report/screenshot/log evidence.

## Authoring

Use `AUTHORING_REQUIRED` only for a missing or unvalidated script. `case_create_draft.authoringActions` must contain atomic actions with an allowlisted target reference. Literal credentials, cookies, tokens, storage state, file paths, and personal data are forbidden.

Harness persists the full action plan in SQLite but gives the Worker only the global summary, previous action summary, current full action, next preview, last observation, page state, and current lease. A plan has at most one active action slot. The cursor advances only after Playwright verifies DOM, URL, request, and business facts.

PLAT-V014 is action-specific. A Midscene action with any model failure, factual failure, false success, insufficient viewport coverage, or insufficient repeats is `DEGRADED`. Harness routes it through verified locate-only support or `PLAYWRIGHT_ONLY`; Agent text cannot override that decision. High-risk actions never execute directly through Midscene.

After every action passes, the task stops at `WAITING_USER` with progress 100. The candidate remains inactive until the user explicitly approves `SCRIPT_ACTIVATION` through `decision_submit`. A failed or ambiguous action also stops, but carries an error code and must never be activated.

Citation: `kb:i4-three-case-authoring:v1#runtime-gates`.
