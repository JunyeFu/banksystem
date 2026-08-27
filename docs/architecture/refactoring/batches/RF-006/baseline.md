---
id: DOC-ARCH-RF006-BASELINE
title: RF-006 Baseline
document_type: baseline
domain: architecture
status: RECORDED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-006 Baseline

- Git commit: `9d79b7c1e6cfedd995093cc7a378dc8e9218fa98`
- Captured at: `2026-08-03T17:48:34+08:00`
- ReleaseIdentity observed: `632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`
- Runtime alignment: `releaseAligned=false`; this identity is not an acceptance baseline.
- Dirty tree manifest: this file records the pre-existing user modification at `RF-005/decision-log.md` and untracked `.pi/`; neither belongs to RF-006.

Observed problem: acceptance runs repeat expensive authoring and poll terminal state serially, while stage timing is insufficient to separate model, authoring, validation, certification and formal-run cost. Full reruns are therefore overused and slow.

Baseline authority is read-only. Historical PASS labels cannot authorize reuse without exact identity, input, candidate and runtime equivalence.

S1 finding `RF006-B05`: the current `authoringProcessingPending` fallback can match historical body text even when the latest Direct Reply is terminal. This explains one class of redundant polling and is frozen as a failing-design baseline for S2; S1 does not change production behavior.
