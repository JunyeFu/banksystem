---
id: DOC-ARCH-RF045-EVIDENCE
title: RF-045 Evidence Index
document_type: evidence
domain: architecture
status: CLOSED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-045 Evidence Index

## Result

RF-045 is `PASS` for CONTRACT, INTEGRATION, and the explicitly authorized read-only browser runtime acceptance. A real BYOK model authored a new Journey, the exact proposal was validated and approved, Harness activated the stability-certified candidate, and the Worker completed the same bound Run in a real Playwright browser. This closes A05-M03 S01 only. It is not Full18, LIVE_E2E, or release GO, and it does not close the remaining A05-M03 S02 CLI evidence-completeness work.

Final runtime evidence: `agent/runs/rf045/20260904-midscene-anchor-repair/runtime-result.json` (`sha256:c7443290c0354c75e493c2c074f385d1290ddcb984d94ac780dd4083a8c6df35`).

- ReleaseIdentity froze twice as `7ba381c4c026705346cb644175fbfb7064a54123ef95cb6677633b885f4e3a74` under Windows PowerShell 5.1.
- Registered repository suite: 631/631; lifecycle contract, refactoring governance, documentation validation, and diff check: PASS.
- Runtime preflight: root status READY, real customer login reached `/portal/dashboard`, view state NORMAL, two account rows, and six-step `hz-agent doctor` READY.
- Authority chain: `session-6c212953fbbe81f9f723a44a10d37f67` -> `journey_15fb13f1-e452-4c1d-b0ae-aa0abea22d4c` -> `candidate_79fe4fb346af7c2032cd16281d732500521a5baa` -> `run_e3688ff1-278a-4ee8-9b52-cd3959a103b6` -> `task_b151245f-578f-4a3a-ba0f-4f91e4b33bfb`.
- Model authoring produced 3 steps and 3 assertions; validate and exact approval passed. Stability was 4/4; the formal Run was PASSED; the Worker Task was SUCCEEDED on attempt 1; all 8 formal assertions passed.
- Runtime artifacts: one redacted report, one redacted log, and one quarantined screenshot. All three stored byte sizes and SHA-256 values match their files.
- The frozen DSL contains zero bank-mutation targets. During the exact Run window, `transfer_order`, `transfer_receipt`, `outbox_event`, `transfer_state_history`, and `transfer_reversal` each gained zero rows.
- Recovery: `demo.ps1 down` completed, volumes were preserved, Agent status is NOT_RUNNING, and all seven target listeners are absent.

## Repair evidence

The successful identity includes the prior adapter/origin, bounded MCP response, controller version-field, and Chinese phrase repairs. It also removes hidden PowerShell 7 assumptions from the public Windows 11 entrypoint: the model probe, atomic progress replacement, OS detection, Java/native stderr capture, fixed process argument, hashing, and random-secret encoding use Windows PowerShell 5.1-compatible APIs. No retry, fallback model, degraded execution, or business-state repair was added.

## Prior attempts

Contract and isolated integration evidence: `agent/runs/rf045/20260903-233000/integration-result.json` (`sha256:5fa3925574fbf7b3d84ee50a3d5b14350bf156c1863d57e82615c8dd5ac40084`).

- Focused execution contract: 3/3.
- Agent CLI: 87/87.
- Registered repository suite: 585/585.
- Refactoring governance: PASS, 1 batch and 27 modules.
- Actual Fresh Harness, Worker and Playwright/Midscene browser acceptance at this historical checkpoint: NOT RUN.
- LIVE_E2E and release decision at this historical checkpoint: NOT RUN.

The evidence proves the CLI-to-MCP orchestration and fail-closed behavior. It does not promote an isolated Harness test projection to a real browser or LIVE result.

Runtime attempt `20260904-runtime-acceptance` stopped at the first deterministic failure:

- ReleaseIdentity: `0d6248ac375432aba3162669207618c19229d9baf5cab3f2acace32e65903137`.
- `prepare`, `up`, and six-step CLI `doctor`: PASS.
- `session start`: exit `3`, `AGENT_SESSION_ROOT_REQUIRED`.
- `journey author|validate|approve|execute`: NOT RUN.
- Recovery: `demo.ps1 down` completed, volumes preserved, target listeners absent.
- Result: `agent/runs/rf045/20260904-runtime-acceptance/runtime-result.json` (`sha256:0075cd0cf254d24004573b3a4943a9954e15508cbf83c4e94bc790755f4d51c2`).

Repair and rerun `20260904-session-root-repair` also stopped at its first deterministic failure:

- The managed runtime specification now owns `sessionRoot`, Harness URL, MCP URL and namespace; `demo.ps1 prepare` writes all four values to the private runtime environment.
- Repair verification: release lifecycle 18/18, Agent CLI 87/87, registered suite 585/585, typecheck and governance PASS.
- New ReleaseIdentity: `5e510ac973dbf12a448143454e688e05067a2208e18eebc42214c03a7d94b1d1`.
- `prepare`, `up`, and the six-step CLI `doctor`: PASS.
- `session start`: exit `1`, `UNEXPECTED_FAILURE`; the session index remained empty and Harness SQLite was not mutated.
- Isolated real-DPAPI session creation passed, so the failure remains unclassified at the CLI session-start boundary.
- `journey author|validate|approve|execute`: NOT RUN; Worker and browser: NOT RUN.
- Recovery: `demo.ps1 down` completed, volumes preserved, seven target listeners absent.
- Result: `agent/runs/rf045/20260904-session-root-repair/runtime-result.json` (`sha256:bbc73270aba40f8fa0865384ba72dd5ce3c85b45909147ac5b58007e8cfc936a`).

MCP endpoint repair and rerun `20260904-mcp-endpoint-repair` stopped at the first configured-model failure:

- Root cause of the preceding `UNEXPECTED_FAILURE`: `HENGZHUN_MCP_URL` pointed to the service root although the MCP SDK requires the Streamable HTTP `/mcp` endpoint.
- The managed contract now binds `/mcp`; CLI doctor derives the same-origin `/health` endpoint independently.
- Red evidence: focused 35/37 and Demo lifecycle contract failure. Green evidence: focused 37/37, Agent CLI 87/87, registered suite 585/585, typecheck and governance PASS.
- New ReleaseIdentity: `944da4501185e664fbd7e4b797130a5a347e7f3ac7cda93aa7b1bfc980867832`.
- `prepare`, `up`, six-step `doctor`, and real `session start`: PASS.
- Created authority chain: `session-cae20bcb6d5f0a97db4ec89ed7714c02` -> `journey_5ff04e97-afea-45e6-b2ae-5361d49e66de`, bound to the new identity.
- The single `journey author` model call failed with `AGENT_ADAPTER_MODEL_TIMEOUT`; no retry, validate, approval, execution, Worker task, or browser action occurred.
- Recovery: `demo.ps1 down` completed, volumes preserved, seven target listeners absent.
- Result: `agent/runs/rf045/20260904-mcp-endpoint-repair/runtime-result.json` (`sha256:dbd4e4892dfdcf7953f7bf97508fefd4a91f43ce67fdc2da8a7bc338af318ad7`).
