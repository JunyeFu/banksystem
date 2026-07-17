---
name: choose-execution-route
description: Select PLAYWRIGHT or AUTHORING_REQUIRED for a validated Hengzhun regression case before plan_compile. Use whenever an Agent must decide whether a stable validated script may run or whether authoring is required.
---

# Choose Execution Route

Choose one route without performing browser operations.

## Decision

- Choose `PLAYWRIGHT` only when the case maps to a registered, deterministic, `SCRIPT_VALIDATED` Playwright script in the Harness catalog.
- The three registered profiles `LOGIN_PROFILE`, `ACCOUNT_OWNERSHIP`, and `AUTH_REJECTION_RECOVERY` use `PLAYWRIGHT` for formal regression.
- Choose `AUTHORING_REQUIRED` for unknown routes, missing scripts, unvalidated scripts, changed contracts, or ambiguous assertions.
- Never replace a missing script with an LLM, Midscene, arbitrary code, or a Coze-only tool during formal execution.

Call `plan_compile` with the case version returned by `case_get`. Treat a version conflict as a request to refresh the case, not permission to overwrite it.

When authoring is required, Harness—not the Agent—chooses among `MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY`, `MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE`, and `PLAYWRIGHT_ONLY` from the persisted PLAT-V014 capability result and action risk. Never force a Midscene route in Agent text.
