---
id: DOC-ARCH-RF028-DECISIONS
title: RF-028 Decision Log
document_type: decision
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-028 Decision Log

- 2026-08-30: Map the requested three management layers to A package, RF capability package and paired slice/task package; retain the repository four-artifact execution interlock.
- 2026-08-30: Keep `v54-implementation-batches.md` and `agent/backlog.yaml` as the only order and status authorities.
- 2026-08-30: Run `VQ-01` through `VQ-08` serially. One image and one functional description are presented per question; only the project owner's textual answer is normative.
- 2026-08-30: Allow RF-028 governance work while RF-027 is machine-blocked because RF-028 touches no runtime, contract, database or shared implementation module.
- 2026-08-30: Record the project owner's verbatim `继续` for `VQ-01` as `CONFIRMED_AND_ADVANCE`; make `VQ-02` the sole current question.
- 2026-08-30: Select the scope-corrected `VQ-02` candidate after removing generated enterprise, loan and unrelated navigation features; retain only customer login, account overview, transactions and the transfer entry.
- 2026-08-30: Accept the owner's `VQ-02` revision request to use the implemented Customer Portal as the visual blueprint; bind the replacement preview to `PV-0006`, `PV-0010`, `PV-0018`, current portal CSS and React pages rather than the generic navy-teal candidate.
- 2026-08-30: Record the owner's verbatim `确认1VQ-02` as confirmation of the sole current `VQ-02`; normalize the single extraneous digit and advance to `VQ-03`.
- 2026-08-30: Bind `VQ-03` visual generation to implemented transfer baselines `PV-0028`, `PV-0034` and `PV-0035` while retaining only the golden-path form and authoritative result readback.
- 2026-08-30: Select `vq-03-customer-transfer-result-v1.png` as the sole `VQ-03` candidate; correct only the transfer, correlation and Fineract identifier prefixes so the visual relationship matches the written contract, then wait for the project owner's textual decision.
- 2026-08-30: Record the project owner's verbatim `继续` for `VQ-03` as `CONFIRMED_AND_ADVANCE`; make `VQ-04` the sole current question.
- 2026-08-30: Bind `VQ-04` visual generation to implemented Operations Console baselines `PV-0073`, `PV-0077` and `PV-0084`; limit the preview to exact correlation lookup and read-only transaction detail.
- 2026-08-30: Select `vq-04-operations-transaction-lookup-v1.png` as the sole `VQ-04` candidate after a targeted edit removed internal account identifiers and replaced the inherited fixture note; retain all query, transaction and read-only evidence fields.
- 2026-08-30: Record the project owner's verbatim `确认` for the sole current `VQ-04` as `CONFIRMED_AND_ADVANCE`; make `VQ-05` the sole current question.
- 2026-08-30: Bind `VQ-05` to the implemented `hz-agent` TUI header/transcript/stage/footer/approval-overlay sources, HIGH-risk exact-suffix policy and the confirmed VQ-01 terminal styling; keep browser execution and evidence outside this preview.
- 2026-08-30: Select `vq-05-cli-author-approve-v1.png` as the sole `VQ-05` candidate; it preserves one session/Journey across validated and approval-required states and contains no execution outcome, automatic approval or secret-bearing field.
- 2026-08-30: Record the project owner's verbatim `确认` for the sole current `VQ-05` as `CONFIRMED_AND_ADVANCE`; confirm the visual gates for contracted Journey authoring and explicit approval, then make `VQ-06` the sole current question.
- 2026-08-30: Bind `VQ-06` to the confirmed VQ-05 terminal language and current CLI runtime bridge, MCP run/evidence projection, Harness artifact store and Worker claim/complete sources; preserve Run PASS versus Release GO as separate gates.
- 2026-08-30: Select `vq-06-cli-execution-evidence-v1.png` as the sole `VQ-06` candidate without revision; it shows one approved Journey and Run across execution and Harness evidence readback, keeps screenshots quarantined, and excludes release identity or GO claims.
- 2026-08-30: Record the project owner's verbatim `确认` for the sole current `VQ-06` as `CONFIRMED_AND_ADVANCE`; confirm the visual gates for MCP/Harness/Worker execution and evidence capture, then make `VQ-07` the sole current question.
- 2026-08-30: Bind `VQ-07` styling to implemented HZ-0001/HZ-0005/HZ-0009 baselines and the current red-black Quality Portal shell, while excluding historical mutation-looking controls and adding the required read-only run evidence detail as the ninth logical view.
- 2026-08-31: Select `vq-07-read-only-quality-portal-v1.png` as the sole `VQ-07` candidate after two label-only `ReleaseIdentity` typography edits; preserve the written contract as spelling authority and keep the image as layout evidence only.
- 2026-08-31: Record the project owner's verbatim `确认` for the sole current `VQ-07` as `CONFIRMED_AND_ADVANCE`; confirm the three A04 visual gates and make `VQ-08` the sole current question before generating its candidate.
- 2026-08-31: Select `vq-08-open-source-onboarding-interview-demo-v1.png` as the sole `VQ-08` candidate after one CLI-content-only correction removed inherited synthetic identities and restored author-validate-approve-execute-browser-evidence-verify order; retain the target-experience label and all release conditions as non-current claims.
- 2026-08-31: Record the project owner's verbatim `确认` for the sole and final current `VQ-08` as `CONFIRMED_AND_COMPLETE_SEQUENCE`; confirm the three A08 visual gates and complete only RF-028 S2 while RF-028 S1 remains in review.
- 2026-08-31: Treat the subsequent project-owner `继续` as authorization to review the next declared hard gate. All S1 command-level conditions remained green, so complete S1, close RF-028, and move its Backlog item to REVIEW without promoting any design preview to product evidence.
