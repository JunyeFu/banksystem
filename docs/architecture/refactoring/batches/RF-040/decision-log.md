---
id: DOC-ARCH-RF040-DECISIONS
title: RF-040 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-040 Decisions

- Use the configured OpenAI-compatible chat-completions endpoint exactly once.
- Treat Harness migration state and Worker code-set readiness as separate gates from HTTP reachability.
- Keep browser readiness tied to the frozen Chromium executable and bank readiness tied to Gateway health.
