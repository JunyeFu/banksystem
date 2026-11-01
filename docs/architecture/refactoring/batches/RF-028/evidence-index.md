---
id: DOC-ARCH-RF028-EVIDENCE
title: RF-028 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-028 Evidence Index

## S1

- `THREE_LEVEL_YAML=PASS large=8 visual=8 confirmed=8 current=NONE a08_visual_gates=3 s2=COMPLETED image_hash=PASS`。
- `REFACTOR_VALIDATION=PASS batches=1 modules=27`。
- `DOC_VALIDATION=PASS metadata=418 links=169 stale_checks=3437 order_files=417 refactoring=True`。
- `git diff --check` exited 0; only existing line-ending notices were emitted.
- S1 was reviewed and completed at `2026-08-31T09:45:43+08:00`; `A01-M02-S01` is `EVIDENCED`.

## S2

`VQ-01` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-01-product-combination-v1.png`, SHA-256 `b4055244a2febe7dcad91f3d56c7407036595d8a818df4c3d85dd085adedc6cb`; the owner's verbatim decision is `继续`, normalized to `CONFIRMED_AND_ADVANCE` at `2026-08-30T21:28:19+08:00`.

`VQ-02` is confirmed. Candidate v1 (`docs/design/visual-acceptance/banksystem-v1/vq-02-customer-login-account-overview-v1.png`, SHA-256 `d46b35460b99648ce0cfe24044b5e567bd67db40bf1d650b2680295e000319c4`) is retained as superseded history. Candidate v2 uses implemented baselines `PV-0006`, `PV-0010`, `PV-0018` and current portal source styling; the selected file is `docs/design/visual-acceptance/banksystem-v1/vq-02-customer-login-account-overview-v2.png`, SHA-256 `ce153c4cb3ca33bdff4fe1edd9648af883d37204e5a1df0c6c73599cabf77974`. The owner's verbatim decision is `确认1VQ-02`, normalized to `CONFIRMED` because `VQ-02` was the sole current question and the single intervening digit is input noise.

Reference SHA-256 values are `PV-0006=0305c11408c70e9c319112953667da962d190f7382da82017cd7cf3416a56e06`, `PV-0010=d6cd04354c003dbe3c83283b252fdaf17d07c1cabfb0eefa1263fd9f5c6da630`, and `PV-0018=51961de2727b9e93f3e3fa75797a88ef6a031715e574bcd21babfdaec8e9da47`.

`VQ-03` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-03-customer-transfer-result-v1.png`, SHA-256 `4e866daf2006ed6692c073f46460c53ce57e7fef809cdd0946b6b1c153edb4a0`. It is bound to implemented transfer baselines `PV-0028=a5fd8801e1e95ccc42dbf4c9b8d553f4de7a3cde5c99ed6ca8ec3842af232f79`, `PV-0034=a89ca7e9c09c6917bb0aea753892aac909b52554a41bc4b6dc7444ebf100b6d3`, and `PV-0035=27fcfa944f7d60674f9ac25054c37501bb7602ce41382b68e63abe8c5bc59b20`. A single targeted edit corrected the visible `TRF-DEMO`, `CORR-DEMO` and `FINERACT-TXN` prefixes; the owner's verbatim decision is `继续`, normalized to `CONFIRMED_AND_ADVANCE` at `2026-08-30T22:23:58+08:00`.

`VQ-04` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-04-operations-transaction-lookup-v1.png`, SHA-256 `a0adf259715398a8b1f993b5ebfe88f6801a0e321a9d0e42d990df40d5d2ffda`. It is bound to implemented Operations Console baselines `PV-0073=bac1deaa42a2a33f6aa78222902f0f70c1bccb5adac882dbca4b830d4e2c1851`, `PV-0077=046fad0948e785fb9b349ec5421f8ebf4159e1ab14d5ed5fddfa6da8d52e00da`, and `PV-0084=4727919d9084b41b463fd5d8d46ee39d0cfd6508ec511b4b77d831c55c2be469`. One targeted edit removed internal account identifiers and replaced the inherited fixture note; the owner's verbatim decision is `确认`, normalized to `CONFIRMED_AND_ADVANCE` at `2026-08-30T22:43:39+08:00`.

`VQ-05` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-05-cli-author-approve-v1.png`, SHA-256 `dbbdc7bd79c84ca0eb6dd14ecf57ef21dc60b445c5e6b4ac66bcd059347e1960`. It is bound to implemented TUI sources `view.mjs=a414e2da10e66e9e00f981e2a336c3cf798441ba2ec6d05ded78cd091cbd3b07`, `model.mjs=22ebc4a0881b334aad417eaddca185338b065f2b4cf8654e9177a9d38191b4d5`, `tui.test.mjs=ad586e8bb09f9a85437489cf19ad0b957440cda912928413a325a1175587021c`, HIGH-risk policy `risk-policy-v2.json=99c93d990a338a2b55e4b5e728e788802fe6d6ec8805dff6c9e61c59aea0b65f`, and confirmed terminal visual reference `VQ-01=b4055244a2febe7dcad91f3d56c7407036595d8a818df4c3d85dd085adedc6cb`. The owner's verbatim decision is `确认`, normalized to `CONFIRMED_AND_ADVANCE` at `2026-08-30T23:09:07+08:00`.

`VQ-06` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-06-cli-execution-evidence-v1.png`, SHA-256 `ceb27df9c383cd781815a5b6fb5435b23db41542db690567e7af3161cceb0f8f`. Built-in ImageGen used the confirmed `VQ-05` image as its sole supporting style reference. The target interaction was derived from implemented sources `view.mjs=a414e2da10e66e9e00f981e2a336c3cf798441ba2ec6d05ded78cd091cbd3b07`, `runtime-bridge.mjs=c72ea8f68105f1ea5227a33ce768ea5a7d6ac2e1c60f643aa25981ba0d1f69d9`, `production-service.mjs=7870252b44763f5022633f6dacff89ad2463d38a9b6a852b450005098c4b6244`, `server.cjs=7af79675c21cd64136bf101ec632f6be9655a5eed67d54939e55c18de73fa8f4`, `journey-evidence-projection.cjs=328015e66c59029dd7732d1cb2d056c1da29640eefc074c2a7ffa1a2246c8494`, `artifact-store.ts=c523a3bb1a1c0ff3bca29bbbbabee192481a69603ae29df5e13ea54b92fc1f2c`, and `worker/index.cjs=d4b8bf5b65e834a44af0bfe8fa11b78db370cd012a9a50b16462967f9ee255ac`. The owner's verbatim decision is `确认`, normalized to `CONFIRMED_AND_ADVANCE` at `2026-08-30T23:46:37+08:00`.

`VQ-07` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-07-read-only-quality-portal-v1.png`, SHA-256 `9bba3f163b56df153067e0980aca1a8237215fd66fe63326f920008a8e7a926d`. Built-in ImageGen used implemented visual references `HZ-0001=aef35148f1ecc921731f8ac439bdd5788b93367adfa55b91c37945671e3a3e20`, `HZ-0005=10f300b44e7b1347ff410a27a5920bb1c41389e505bee8f7c7cecf34da43e910`, and `HZ-0009=4d105955bcfd76755116a879f10311483a77b6fb8c27b1d24fb9360450f3adc7`. The target behavior was derived from current sources `App.tsx=50d8868145ec9f363b72783d8432796d55e7e9422ac6292514950145bfcd8c64`, `pages.tsx=039596032aaa6a3bef2fd598ffbda07b4f08efa30a7a8821bb55db0e01862483`, `styles.css=9f102f372c022f13ba3d4479491b662d4b3326f68157d57304f320a2dded9bec`, `api.ts=f5ea7b921af68f7ee2e77485a9b8e944e58247a4f749acd495314da44b8faa11`, and `quality-platform-api.yaml=4bc4378267b9cc5956b605c2325e58a29924f1a932141ef244d0e7d2fa818008`. Two targeted edits changed only the `ReleaseIdentity` label typography; the written task contract remains the spelling authority because AI glyphs are not executable text. The owner's verbatim decision is `确认`, normalized to `CONFIRMED_AND_ADVANCE` at `2026-08-31T09:22:45+08:00`; `VQ-08` is now the sole current question.

`VQ-08` is confirmed. The selected candidate is `docs/design/visual-acceptance/banksystem-v1/vq-08-open-source-onboarding-interview-demo-v1.png`, SHA-256 `6abfa7700990b40ccdfee08beaf7204c802de021125a7c4d6eaf1d131a0b6421`. Built-in ImageGen used confirmed references `VQ-02=ce153c4cb3ca33bdff4fe1edd9648af883d37204e5a1df0c6c73599cabf77974`, `VQ-04=a0adf259715398a8b1f993b5ebfe88f6801a0e321a9d0e42d990df40d5d2ffda`, `VQ-06=ceb27df9c383cd781815a5b6fb5435b23db41542db690567e7af3161cceb0f8f`, and `VQ-07=9bba3f163b56df153067e0980aca1a8237215fd66fe63326f920008a8e7a926d`. One targeted edit removed synthetic CLI session/Journey values and corrected the visible workflow order without changing the rest of the page. The selected design shows the target README first screen, eight PowerShell commands, four product entries, a five-step 5–8 minute live demo and explicit Fineract/Harness/Flowise boundaries. The owner's verbatim decision is `确认`, normalized to `CONFIRMED_AND_COMPLETE_SEQUENCE` at `2026-08-31T09:38:07+08:00`. Its target-design label and absence of pass badges preserve the distinction from current runtime, Full18, CI and release evidence; all eight visual questions are now confirmed and RF-028 S2 is complete.

- `THREE_LEVEL_YAML=PASS large=8 visual=8 confirmed=8 current=NONE a08_visual_gates=3 s2=COMPLETED image_hash=PASS`.
- `VQ08_REFERENCE_HASHES=PASS customer=ce153c4c operations=a0adf259 cli=ceb27df9 quality=9bba3f16 candidate=6abfa770`.
- `VQ08_IMAGE_INSPECTION=PASS badges=4 commands=8 surfaces=4 timeline_steps=5 truth_boundaries=3 target_label=true fabricated_release_claims=false secrets=false`.
- `REFACTOR_VALIDATION=PASS batches=1 modules=27`.
- `DOC_VALIDATION=PASS metadata=418 links=169 stale_checks=3437 order_files=417 refactoring=True`.
- `git diff --check` exited 0; only working-tree line-ending notices were emitted.

Evidence class is DOC/GOVERNANCE and DESIGN_PREVIEW only. No implementation, runtime, model binding, browser execution, LIVE_E2E or release claim is earned.

## Closure

RF-028 S1 and S2 are `COMPLETED`; RF-028 is `CLOSED`. The Backlog item is `REVIEW`, matching the repository's post-implementation evidence-review convention. Closure changes no product runtime, ReleaseIdentity, database, contract or release state.
