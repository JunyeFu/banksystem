# Test and Evidence Rules

- Tests must be deterministic, isolated, repeatable, and use synthetic/redacted data.
- Each run uses a clean BrowserContext, Fixture namespace, and evidence directory.
- Storage State is short-lived, access-controlled, excluded from Git/RAG/logs, and deleted after use.
- Visual baselines require a fixed OS, browser, viewport, font set, locale, and deterministic data.
- Regression execution uses validated scripts; LLM, Midscene, or vision calls are not allowed during scheduled formal execution.
- Evidence records case, run, commit, contract version, baseline version, SHA-256, timestamps, and business assertions.
- Money flows require accounting and reconciliation assertions, not only UI success.
