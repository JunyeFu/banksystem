---
id: DOC-ARCH-RF045-DECISIONS
title: RF-045 Decision Log
document_type: decision_log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-045 Decisions

- Treat the explicit execute command as authorization for the fixed on-demand chain.
- Bind the frozen Journey target, entry URL, and credential reference through `target_profile_prepare` and exact `target_profile_decision_submit` before case preparation; never synthesize authoring context.
- Preserve Harness business error codes at the CLI boundary and stop before the next mutation.
- Give the single tool-free authoring model call a fixed 90-second deadline with zero retries; the former 30-second deadline produced a confirmed false timeout while the same contract completed in a bounded diagnostic call.
- Normalize the observed Chinese existence assertion `及对应的可用余额` to its trailing business noun `可用余额`; do not treat the leading quantifier phrase as the browser evidence anchor.
- Preserve an explicit read-only navigation disjunction as alternative visible labels: `账户概览或账户列表` may match either label, while mutation controls continue to require their literal approved target.
- Bind every generated `waitForURL` to the URL captured immediately before its preceding click, or to the current page when no click is paired; a static launch URL is not a valid navigation baseline after redirects.
- Project `VALIDATION_FAILED` candidates and failed stability batches as `FAILED_ACTIONABLE` with the exact stability error and batch ID; do not leave the CLI polling until its outer deadline.
- Require `journey author --adapter fuxing-bank-demo` for the controlled bank target. The option is an explicit structured user choice; target name, URL, model output, and draft fields cannot infer or forge it.
- Resolve all browser request origins through one Worker policy. Authoring, stability certification, and formal execution apply the same route interception; the Fuxing identity-provider origin is admitted only by the frozen registered adapter binding.
- Return the same bounded Journey projection from both state-changing MCP Journey tools. A committed Harness transition must not be reclassified as an MCP output-budget failure.
- Read the real Harness `candidateVersion` result for the controller mutation-version fence; do not accept a test-only generic version field as the candidate authority.
- Map an explicit Chinese RMB currency assertion to the visible `CNY` code, and compile locate-only prose without click or navigation verbs as `expectVisible`.
- Keep the root Windows 11 lifecycle executable under Windows PowerShell 5.1. Use APIs common to 5.1 and 7 for HTTP probing, atomic progress replacement, platform detection, native stderr capture, process arguments, hashing, and random-byte encoding; do not add host-version branches, retries, or fallback paths.
- Drive transitions only from current Harness `nextAction` and exact proposals.
- Stop at the first failure or unexpected state.
- Separate Run creation/Worker observation from RF-046 evidence completeness.
- Close RF-045 only after the new identity completed a real BYOK-authored read-only Journey with 4/4 stability, a PASSED Run, a SUCCEEDED one-attempt Worker Task, verified artifact hashes, zero bank business writes, and a state-preserving shutdown.
