---
id: DOC-ARCH-RF046-DECISIONS
title: RF-046 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-06
owner: Codex
---
# RF-046 Decisions

- Harness performs byte-level verification because it owns SQLite artifact metadata and the artifact store.
- CLI reaches verification only through a read-only MCP tool and never receives local paths or download grants.
- DOM evidence contains structure and hashes, not input values or unrestricted page text.
- Network evidence contains method, origin, pathname, resource type and status only; query strings, headers and bodies are excluded.
- Playwright trace excludes source files and remains a Harness-managed artifact.
- Screenshot remains quarantined until a separate pixel-redaction verifier exists.
- RF-046 completion closes A05-M03-S02 only; Full18 and release decisions remain A06 gates.
- Runtime attempt 1 stopped before browser execution because a negative transfer prohibition was classified as transfer intent. The smallest source repair was applied and verified offline; a new ReleaseIdentity and fresh runtime attempt are required before closure.
- Runtime attempt 2 (2026-09-08, identity `2c72dfad9c9bfaeeddf99189c29635a4a2e246d6530dca96aadb35eeb7d033f4`) passed login but stopped at `I10_MIDSCENE_LOCATOR_MISMATCH`. The observed page-qualified collection phrase now retains only its business noun for read-only locating; mutation matching is unchanged.
- The same frozen executable plan exposed a standalone read-only prohibition compiled as a click. The compiler now carries that observed prohibition as an invariant rather than an executable action. Both repairs have focused behavioral tests; neither removes real visual locating or Playwright verification.
- Preparation installs dependencies and must not run concurrently with tests. Subsequent runtime and regression checks are separated to avoid resource interference; interrupted or timed-out registrations are not counted as passing evidence.
