---
id: DOC-ARCH-RF057-DECISION
title: RF-057 decisions
document_type: reference
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# Decisions

2026-09-28 A01 resumed: user “回复A01测试，不需要我批混” is understood as restoring/resuming A01 without a further manual approval turn. Authorize only the current repaired source identity `7e4cadd2db9224bd1da58ff66ca83afcbf1ead1e16dc6e9a45899285a7913214`, its owned managed refresh and one real BYOK read-only A01. Identity enforcement remains; no new platform approval gate or broad later-scenario authorization is inferred. The same existing command and first-failure stop rule apply.

2026-09-28 repair implementation: user “落盘修复” approves R1–R5 refinement. Authentication shares v2 JSON, freezes explicit origins and uses PKCE; the unbound generic login path is not converted into a bank template. Quality OpenAPI 3.0.0 is a deliberate array-to-page change with simultaneous generated consumer upgrade, not a compatibility layer. Isolated browser/Harness and actual-bank authentication checks prove these repairs only. Six real authentication checks passed; a wrong probe's unauthenticated fetch and the observed Keycloak error-selector mismatch were corrected before re-running, never retried silently. Native running process fingerprints remain old; controlled refresh and new-identity BYOK A01 require separate exact-identity authorization. See [verified repair state](repair-implementation-a01-001.md).

2026-09-28: Replace inherited test-count semantics with actual bank business and CLI acceptance. Retain legacy artifacts, not legacy platform gates. Use bundled Playwright and native Node HTTP load, avoiding a new runtime tool dependency. The user requested real tests, business scenarios, pressure and performance; test-tool contracts alone never satisfy that request. Keep existing model and credentials; use no stage8 mock bank. Current identity-specific Agent LIVE authorization is not inferred from a test suite approval; prepare exact new hash when the final test drivers exist.

2026-09-28 S2: Implement the real read-only A01 vertical slice first, with current-identity, actual-bank-origin and verified-artifact assertions. Add test source to the existing v4 manifest rather than inventing a separate release identity. Do not bootstrap a money transfer for read-only Agent setup. Do not expand the remaining Agent matrix or claim load results before the first real execution gate is satisfied. A01 preparation is complete, execution awaits exact-identity LIVE authorization; S2 remains IMPLEMENTING.

2026-09-28 authorized A01 attempt: exact-identity authorization was received and consumed for one real CLI attempt. The first visual-authoring target-location failure stopped validation; temporary test identities were cleaned and owned services retained. Record the Harness business error independently of the driver's generic assertion code. Do not repair production Worker/Harness code or rerun under the test-only authorization; first refine the observed failure's repair scope, preserve the old failed record, and recompute identity after any covered source change.

2026-09-28 root diagnosis: the direct cause is generic authentication compilation replacing the explicit SSO intent with immediate credential-form filling on the portal page. Old controlled adapter selectors are a separate confirmed drift, not the direct `DYNAMIC_002` failure. Use [the scoped repair document](root-cause-and-repair-a01-001.md) to refine S2 before implementation; do not increase retries/model budgets or revert the PKCE portal to accommodate the test engine. Quality pagination is a separate observed repair, not a substitute for A01 success.
