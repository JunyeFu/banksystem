---
id: DOC-ARCH-RF027-EVIDENCE
title: RF-027 Evidence Index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# RF-027 Evidence Index

## Prior blocked result (2026-08-30)

- RF-027 governance, core Compose config, channel Compose config and docs validation exited 0.
- Host builds passed for customer portal, operations console and the read-only quality portal.
- Quality OpenAPI generation first exposed one duplicate `401` key and then stale write/knowledge consumers; the duplicate was removed and the portal was aligned to the existing GET-only contract.
- Browser QA at `http://127.0.0.1:4173/quality/cases` confirmed the expected title and route, meaningful content, no framework overlay, no console warning/error, zero `新建用例`, zero `知识与作者化`, and a working search input. The expected API unavailable state remained because Harness was not started.
- Docker image build did not pass. The original Docker Hub/npm failures were traced to a stale Docker Desktop manual proxy; host and proxy endpoint probes proved the replacement endpoint could complete the Registry CONNECT handshake.
- Docker Desktop 4.83.0 then reproduced the known Windows AF_UNIX startup crash on `dockerInference` and `docker-secrets-engine/engine.sock`. With Docker stopped, both parent directories were moved to recoverable `.stale-*` locations, a new empty `Docker/run` was created, and Docker AI/Inference was disabled. The backend subsequently passed both socket initializers and reached `starting engine linux/wsl`.
- The remaining deterministic blocker is system WSL service unresponsiveness: `wsl.exe --status` exceeded a 15-second hard timeout and the current non-administrator process could not restart `WslService`. Docker Engine never reached ready, so no frontend image was accepted as built.

At that observation time, evidence classes were STATIC, CONTRACT, rendered frontend QA and machine-level Docker failure diagnosis. No container INTEGRATION, runtime, model, bank business, LIVE_E2E or release evidence had been earned.

## S1 closure (2026-08-31)

- `wsl.exe --status` returned within 15 seconds with exit code 0; `WslService` was `Running`.
- `docker version --format '{{json .Server.Version}}'` returned `"29.6.2"` with exit code 0.
- RF-027 governance, core Compose config and channel Compose config exited 0.
- Customer, operations and quality host builds exited 0; the quality build regenerated the GET-only OpenAPI client before TypeScript and Vite validation.
- The first clean customer image build stopped on unresolved `react`, `antd` and `react/jsx-runtime` imports from linked `bank-ui-kit` source. The generic Dockerfile now exposes the selected application's installed dependency tree at `/workspace/node_modules`, matching Node/TypeScript upward resolution for the linked source package without installing a second dependency tree.
- Customer image `local/customer-portal:0.1.0` built as `sha256:bfa5bc7c280ae7edfb79b90d4efcc56b3b1a07cd7c50fdd7d77b3a057c159687`.
- Operations image `local/operations-console:0.1.0` built as `sha256:7e08e52351c309dd9ab8aca511e7438f3addc274836cf3821d3de432c1d97b09`.
- Quality image `local/quality-case-portal:0.1.0` built as `sha256:ba304ee359b562d99acc81bc76ff5a7d70b47e4a3da9b91220e281766c1a4161`.
- `RF027_S1_PORTABILITY=PASS named_volume=1 host_dist_mounts=0 pinned_stages=2 dependency_bridge=1 images=3`.
- RF-027 validator, docs validator and `git diff --check` pass; only existing line-ending notices remain.

RF-027-S1 is `COMPLETED`. Evidence earned is STATIC, CONTRACT and BUILD_ARTIFACT only. No service/container runtime, empty-volume startup, bank transaction, model call, browser LIVE_E2E or release result was executed. RF-027 remains `BLOCKED` because S2 and S3 do not yet have their required slice and command-level task packages; the former WSL/Docker machine blocker is closed.

## S2 authorization (2026-08-31)

- The project owner instructed Codex to complete the work autonomously.
- `slices/S2.yaml` and `tasks/RF-027-S2.md` now freeze the root lifecycle objective, write boundary, command-level tests, exit codes and rollback point.
- RF-027 and A02 moved from direction-refinement blocking to active implementation. This entry is authorization/governance evidence only and does not claim that the lifecycle implementation or runtime integration has passed.

## S2 implementation and blocked preflight (2026-08-31)

- `demo.ps1` now implements the root command parser and secret-free `status` projection. It reports six fixed local addresses, Docker state, expected/running bank services, independent Harness/MCP/Worker state, ReleaseIdentity state and a hashed model base URL without exposing credentials.
- `prepare` validates exactly `HENGZHUN_MODEL_NAME`, `HENGZHUN_MODEL_BASE_URL` and `HENGZHUN_MODEL_API_KEY`; it probes only that endpoint's `/models` path and fails immediately for missing, malformed or unavailable configuration. It then checks Windows, Docker, Node, Java 21, agent Node runtimes and Playwright before writing local credentials or building images.
- `up` is wired in the fixed order core Compose, channel Compose, then existing `NORMAL_CLI` Harness/MCP/Worker lifecycle. `down` reverses only those owned services and preserves named volumes. `reset` is the only lifecycle command that removes the two named Compose project volumes and the exact Agent `.data` directory.
- `verify-demo-lifecycle.ps1` passed: `DEMO_LIFECYCLE_CONTRACT=PASS invalid_exit=2 invalid_model_exit=2 unavailable_model_exit=3 invalid_up_exit=2 status_schema=v1 addresses=6 flowise_runtime=0`.
- RF-027 governance, both Compose config checks, docs validation (`metadata=419 links=169 stale_checks=3444 order_files=418`) and `git diff --check` passed. The latter reported only existing line-ending notices.
- Current real `demo.ps1 prepare` returned `DEMO_MODEL_CONFIG_REQUIRED` with exit code `2`; no local environment file, secrets, runtime state, images or service process was written by that invocation. Current `status` is `NOT_READY`: Docker Engine 29.6.2 responds, all expected bank services are stopped, Harness/MCP/Worker are not running, and no ReleaseIdentity/model binding is active.
- Independent preflight probes identify two additional machine/project prerequisites after BYOK configuration: host Java is 17 while `prepare` requires Java 21, and `platform/hengzhun-regression-system/node_modules` lacks the `playwright` package/browser. Worker code references Playwright/Midscene, but its install ownership is not in S2's allowed paths; Flowise remains excluded and is not used as a substitute.

S2 remains `BLOCKED` on the explicit BYOK configuration plus Java 21 and the subsequent owned Playwright dependency task. Evidence is STATIC and CONTRACT only; no product service, bank transaction, real browser test, Agent LIVE, Full18 or release decision has run.

## S2 runtime closure (2026-09-01)

- Explicit BYOK configuration was present and checked without printing the API key. `prepare` probed the configured model endpoint and retained a single model binding.
- The first `prepare` attempt stopped at `DEMO_JAVA_21_REQUIRED`. The public status contract reproduced the defect because PATH Java 17 masked installed Temurin 21. The resolver now selects a candidate only after verifying major version 21 or newer; the contract moved RED to PASS and status reported `java.ready=true`, `major=21`.
- The second `prepare` attempt stopped at `DEMO_RELEASE_IDENTITY_FAILED`. A non-secret synthetic probe proved the identity script failed from the repository root and succeeded from the independent Agent root. The lifecycle now executes the v4 identity computation from that authority root.
- The third `prepare` completed and froze ReleaseIdentity `19e031c7acb27b75e41183dedcbb19f49f0ec5fedc3c43f829ec883441be0007`; the API key was not emitted.
- The first `up` stopped at `DEMO_CHANNEL_START_FAILED`. Read-only inspection identified two same-project operations-console containers; the old canonical container was exited, mount-free and held the recorded `18083` bind failure. Owned `down` preserved 7 volumes, and stale container `a751ff2f6736` was removed explicitly.
- The repeated `up` returned `READY`. Core ran 4/4 expected services, Channel ran 11/11, and independent Harness/MCP/Worker were current, owned and healthy under the same ReleaseIdentity.
- Secret-free HTTP probes returned customer portal `200`, operations console `200`, Keycloak `200`, Gateway root `404`, and Quality root `401`. These are reachability facts only; no business assertion was inferred.
- `down` returned `STOPPED`; Harness/MCP/Worker stopped, project running containers reached 0, and 7 named volumes remained.
- The first stopped-state readback incorrectly reported ReleaseIdentity `UNAVAILABLE` because it only inspected process state. The status projection now falls back to the frozen identity in local Agent runtime configuration and reports `FROZEN` with the same `19e031c7...be0007` hash while all services remain stopped.
- The packaged-I10 inspector is not structurally compatible with the new repository-root lifecycle: before/after inspection reported runtime, public readback and acceptance as `UNAVAILABLE`. This limitation is recorded rather than promoted to identity or acceptance evidence.

RF-027-S2 is `COMPLETED`. Evidence earned is CONTRACT and local runtime INTEGRATION. No customer login, transfer, Fineract ledger assertion, Agent browser execution, LIVE_E2E, Full18, human acceptance or release decision has been completed.

## S3 authorization and preflight (2026-09-01)

- `slices/S3.yaml` and `tasks/RF-027-S3.md` freeze one objective: hashed snapshot, exact reset, empty-volume start, cold restart and automatic restoration.
- Services are stopped, ReleaseIdentity remains frozen at `19e031c7acb27b75e41183dedcbb19f49f0ec5fedc3c43f829ec883441be0007`, and the configured model binding is present without exposing its key.
- Read-only Docker inspection identifies six volumes declared by the current Compose files. `mifos-channel_channel_pg_data` carries an old project label but is no longer declared and is excluded from reset.
- Preflight found that the current reset recursively deletes the entire Agent `.data` tree, including historical evidence, backups and credentials. This is the initial RED condition; no reset has been executed.

S3 is `ACTIVE`. No state mutation, empty-volume start, cold restart, business action, model LIVE, Full18 or release decision is claimed by this entry.

## S3 reset-scope implementation and execution gate (2026-09-01)

- Lifecycle contract first failed with `DEMO_RESET_AGENT_DATA_TREE_FORBIDDEN`, proving the prior recursive `.data` deletion. After implementation it passed with `reset_scope=explicit`.
- `demo.ps1 reset` now targets only `runtime.env`, runtime, SQLite, generated artifacts/candidates/stability, Midscene/image/video transient runs and logs. Historical evidence, backups, credentials and the undeclared legacy volume remain outside reset ownership.
- `verify-demo-cold-start.ps1` requires `-Execute`, inventories six declared volumes, uses the exact local Debian image identity, archives and hashes volume content, hashes and atomically moves the Agent targets, performs two starts with a preserved-state restart, and restores original state in `finally`.
- Preflight measured approximately 200 MB across the six declared volumes and approximately 10.8 GB across the Agent targets, with approximately 412 GB free on drive D.
- The real `-Execute` process was rejected before creation because the existing instruction did not explicitly authorize deletion and reconstruction of those exact volumes and Agent targets. A read-only post-check confirmed all six volumes still exist, no project container is running, ReleaseIdentity remains `19e031c7...be0007`, and the model binding remains present.

S3 remains `ACTIVE`, blocked only on explicit authorization for the hashed backup, reset, two cold starts and automatic restoration. No state mutation or runtime result is claimed.

## S3 first authorized execution stopped (2026-09-01)

- The project owner explicitly authorized `RF-027-S3-COLD-START-001` with hashed backups, exact reset, two cold starts and automatic restoration.
- The verifier stopped before its first backup because the single Docker image-ID output was unwrapped to a scalar string and `[0]` returned `System.Char`; calling `Trim()` on that value failed deterministically.
- The first-failure rule stopped the campaign. No Agent target was moved, no reset was called and no Docker volume was deleted.
- Post-failure readback confirmed all six declared volumes exist, no project container is running, ReleaseIdentity remains `19e031c7...be0007`, and the model binding remains unchanged.
- The verifier now normalizes the native-command result to an array before selecting and trimming the first string. This source repair is validated statically only; the authorized campaign was not retried.

S3 remains `ACTIVE` and requires renewed authorization to restart the complete checklist from its beginning.

## S3 reauthorized empty-volume start stopped and restored (2026-09-01)

- The renewed campaign completed six volume archives/content manifests and the Agent-state manifest, moved only the declared Agent targets, executed reset and reached the first empty-volume `up`.
- The first `up` returned exit code `3` with `DEMO_CORE_START_FAILED`. The verifier stopped immediately; it did not start Channel/Agent services and did not attempt the second start.
- Failure cleanup restored all six current volumes. Each restored file-content manifest matches its pre-reset manifest. The undeclared legacy `mifos-channel_channel_pg_data` volume remained present and outside reset ownership.
- Manual post-failure verification recomputed the restored Agent manifest as `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25`, exactly matching `agent-before.json`. Services are stopped; ReleaseIdentity and model binding are unchanged.
- Read-only inspection found eight CRLF sequences in `postgresql/01-init-unix.sh`. Existing-volume starts skip this initializer, while an empty PostgreSQL volume executes it inside Linux. This is the evidence-backed cause candidate for the cold-only core failure.
- The initializer is now LF-only and `.gitattributes` fixes every `*.sh` checkout to LF. The lifecycle contract enforces both current bytes and the Git attribute.
- The verifier now captures only Compose `ps` state on failure and performs the Agent restoration manifest check inside `finally`, before propagating the original deterministic failure.

The repair is STATIC/CONTRACT only and has not been retried. S3 remains `ACTIVE` pending renewed authorization from the checklist start.

## S3 LF-verification execution externally interrupted and restored (2026-09-01)

- The third authorized run completed its backups and advanced beyond the previous core failure: readback after the host interruption showed all 4 core and all 11 channel services running. This supports the LF repair but is not a completed cold-start result.
- The foreground execution host aborted the command at approximately ten minutes without returning the verifier's success or deterministic failure JSON. The child process was terminated before its `finally` completed, leaving cold bank containers and the original Agent targets in the hashed backup directory.
- Validation stopped. A dedicated boundary-checked restore command removed the cold state, restored six volume archives with 6/6 matching content manifests, moved the original Agent targets back and matched Agent manifest `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25`. The legacy undeclared volume remained present.
- Read-only lifecycle review confirmed a 30-second health deadline per Agent service. No deterministic product failure was returned by the interrupted run.
- The preflight service check incorrectly combined two different Compose project labels as AND filters and could never observe a running project. It now queries each project separately and combines the results.
- Subsequent long execution must run as a hidden managed background process so the verifier, especially `finally`, is not killed by the foreground tool-session limit.

S3 remains `ACTIVE`. The interrupted run is not PASS and not a deterministic product failure; the same authorization continues only from the complete checklist start after restoration.

## S3 continued run reached first READY then stopped on verifier wait (2026-09-01)

- The continued run started from a new backup set. Runtime readback proved the LF-fixed empty state reached core `4/4`, channel `11/11`, and Harness/MCP/Worker `3/3` healthy under ReleaseIdentity `19e031c7...be0007`.
- After the first complete `READY`, the verifier remained alive with no child process, no CPU progress, no `down` transition and no failure record for several minutes. The second start was never attempted.
- The deterministic stall triggered the first-failure rule. The exact verifier PID was stopped, and the dedicated restore script removed cold state, restored 6/6 matching volume manifests and matched the Agent manifest at `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25`; the legacy undeclared volume was preserved.
- The stall occurs in the verifier's nested PowerShell output capture after Agent services detach. `Invoke-Demo` now redirects child stdout/stderr to files, waits only for the exact child PID and fails at a 600-second command deadline. This matches the already proven process pattern in the lifecycle contract test.

The first empty-state READY is integration evidence for the LF repair, but S3 remains `ACTIVE`: no preserved-state second READY or complete verifier PASS exists, and the wait fix has not been retried.

## S3 complete double-start and restoration PASS (2026-09-01)

- The project owner reauthorized `RF-027-S3-COLD-START-001` after the verifier pipe-wait repair. The campaign started from a new backup set at `agent/runs/rf027-s3/20260901-110552` and returned `banksystem-demo-cold-start-evidence/v1`, `status=PASS`, exit code `0`.
- The empty-state first start and preserved-state second start both reached `READY`. `releaseIdentity` and `coldRestartReleaseIdentity` both equal `19e031c7acb27b75e41183dedcbb19f49f0ec5fedc3c43f829ec883441be0007`.
- The restored Agent manifest is `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25` and `originalStateRestored=true`.
- The retained backup archives have SHA-256 values: core PostgreSQL `66303c772222147f9a739cf8455644380acdaa0d3e5747e803d8ede62d909241`; Bank Channel PostgreSQL `a4e1246c93e7d0057e55d8a2f8f6f793e26fcc4d0dd6db85812cb4b9d46b1391`; Keycloak `adaeaad59d718ea6b112157a61229cf3678034246f486aa68da277d75590319b`; Grafana `22a5b6e3609cb38e64e4d4782dc0afd3eb691b4fd576d0327479457d877b2366`; Loki `0d759db03f4e2a2a9aea488bc3e5b49ad2af09adccb0371fdb85a54a8c5805ac`; Prometheus `0b2806de05365f28a3ac4253f253d2b6a633dd343f17d310af4359d7f5a57ef6`.
- The six restored volume content manifests match their pre-reset values: core PostgreSQL `d1f327dbeb18b2e2b38c9713636a76115e014017dfae5321572050ac2c876e5f`; Bank Channel PostgreSQL `7f27ebea22a141483037b754e7af35348780e1dd8c248a1b2f265ab4cb745d9c`; Keycloak `afce0952bac267a8fd734e23daa5097a06df4bd2cf9e411c4d86462d06c9e163`; Grafana `f37463d9d28254b578c18a46c5dcf8499d63ce7d38eba796bfcb319132981c5f`; Loki `5054956b5712a09256e8e13024df5eeee1b80f5066b862254fceb38ae412c9b0`; Prometheus `354a872f9a8fd6899cdf7985316897b1886658e190e122c6833d589c6df4ce77`.
- Post-restoration readback found zero running containers in each owned Compose project, all six declared volumes present, the undeclared legacy `mifos-channel_channel_pg_data` volume present, Agent services `NOT_RUNNING`, ReleaseIdentity `FROZEN` at the same hash and model binding `BOUND`.

RF-027-S3 is `COMPLETED` with local `INTEGRATION` evidence. This current dirty checkout does not satisfy the separate clean-clone or new-machine reproduction proof, and no bank business, model LIVE, Full18, human acceptance or release decision is claimed.

## S4 first clean-clone execution stopped before clone creation (2026-09-01)

- Run `agent/runs/rf027-s4/20260901-130529` stopped at the first deterministic failure with `DEMO_CLEAN_CLONE_SOURCE_FILE_INVALID`. No temporary commit, clone, container, isolated volume or product service was created.
- Read-only reproduction found 112 Git-quoted non-ASCII path strings from the default `git ls-files` output and zero missing paths when `core.quotepath=false` was applied. The source enumerator now requests unquoted paths explicitly.
- Cleanup and post-check returned `originalStatePreserved=true` and `isolatedResourcesRemoved=true`. The original Agent manifest remains `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25`; all six original volume manifest hashes match the S3-restored values.

This failed attempt earns diagnosis and restoration evidence only. S4 remains `ACTIVE`; the repaired complete checklist has not been executed.

## S4 second clean-clone execution stopped at runtime download (2026-09-01)

- Run `agent/runs/rf027-s4/20260901-131228` enumerated 1873 candidate files, created a clean temporary commit and clone, and proved the clone initially had no `.env`, Agent `.data`, Node runtime, browser packages or portal `dist`.
- The first lifecycle command stopped at `prepare` with a safe download failure before any service start. Cleanup removed the clone and all isolated resources; `originalStatePreserved=true` and the original Agent/six-volume manifests remain unchanged.
- Both frozen versions exist on the official Node distribution endpoint: the corrected v20.20.2 and v24.19.0 Windows x64 archive URLs return HTTP 200, and both manifest SHA-256 values match the official `SHASUMS256.txt`. The implementation had concatenated `https://nodejs.org/dist` and `v...` without a slash.
- `Ensure-AgentNodeRuntimes` now builds `{source}/v{version}/{archive}` and maps download failure to `DEMO_AGENT_RUNTIME_DOWNLOAD_FAILED`. The verifier also normalizes the four single-line Git outputs before indexing so commit and tree evidence cannot degrade to one character.

This attempt earns clean-clone preflight, diagnosis and restoration evidence only. S4 remains `ACTIVE`; the corrected complete checklist has not been executed.

## S4 third clean-clone execution stopped at runtime extraction readback (2026-09-01)

- Run `agent/runs/rf027-s4/20260901-154003` enumerated 1873 candidate files, created candidate commit `f07c22237e0f5b68b17a30e115a09042e7e66d19` with tree `a606a4cf372df9a606a08f89704e4bebca14d15f`, cloned it cleanly and again proved that no local credentials, Agent state, Node runtime, browser packages or portal `dist` were present.
- The corrected URLs downloaded archives whose SHA-256 values matched the frozen manifest. `prepare` then returned `DEMO_AGENT_RUNTIME_ARCHIVE_INVALID` before any service start. The verifier stopped validation immediately, removed its isolated resources and reported `originalStatePreserved=true` and `isolatedResourcesRemoved=true`; the original Agent and six declared volume manifests still match the S3-restored values.
- Post-stop diagnosis used both frozen official archives. Their top-level directory names and `node.exe` entries match the manifest. `Expand-Archive` succeeded for both versions with the archive inside its destination directory. Two sequential provisioning probes, including fresh network downloads and target paths up to 178 characters, completed hash verification, extraction, move and exact `node --version` readback for `v20.20.2` and `v24.19.0`.
- The archive/extraction failure is therefore not reproducible as a deterministic source defect. The confirmed diagnostic defect was that the public `prepare` result discarded the safe `services` or `cli` suffix. `demo.ps1` now retains that suffix as `runtimeRole` only for governed Agent runtime errors; no retry, alternate archive, extractor fallback or model fallback was added.

This attempt earns clean-clone preflight, restoration and focused archive-provisioning CONTRACT evidence only. S4 remains `ACTIVE`; a new complete execution must start from the checklist beginning and is not authorized by this stopped campaign.

## S4 fourth clean-clone execution stopped at the repeated Node 20 extraction boundary (2026-09-01)

- Run `agent/runs/rf027-s4/20260901-155636` began from a new source and state hash baseline. It enumerated 1873 candidate files, created candidate commit `d5233c9d1f255bc416469bd90149377ab1b0e6a5` with tree `9c54b605a7a663988590e2a9144c4e9116dd039f`, cloned it cleanly and proved no prebuilt or private runtime state was present.
- The first command again stopped at `prepare` with `DEMO_AGENT_RUNTIME_ARCHIVE_INVALID`; the new safe context identified `runtimeRole=services`, so the failing boundary is specifically the frozen Node 20 runtime. No `up`, service health, business action or later checklist item ran.
- Cleanup returned `STOPPED`, removed all temporary execution roots and isolated resources, and reported `originalStatePreserved=true`. The original Agent manifest remains `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25`; all six declared volume manifests remain equal to the restored S3 baseline and the undeclared legacy volume remains present.
- The same official Node 20 archive still passes SHA, extraction and exact version readback in the identical temporary path family. Because the hidden clean-clone lifecycle has now reproduced the same `Expand-Archive` readback failure twice, the single extraction implementation was changed to Windows 11 `tar.exe`; there is no retry or extractor fallback. A focused `tar.exe` probe returned exit `0`, found `node.exe` and read exact version `v20.20.2`.

This attempt earns repeated-failure diagnosis, restoration and focused extractor CONTRACT evidence only. S4 remains `ACTIVE`; the `tar.exe` implementation has not yet passed the complete clean-clone checklist.

## S4 fifth clean-clone execution stopped at the pre-move Node check (2026-09-01)

- Run `agent/runs/rf027-s4/20260901-221056` began from a new baseline, enumerated 1873 files and created clean candidate commit `8fbe1cb56e96c058b7335d9df35394b11c877846` with tree `eafebddcffbadd153ba0efcfa7aef06ec729e540`. The clone again contained no private or prebuilt runtime state.
- `prepare` passed the `tar.exe` process boundary but returned `DEMO_AGENT_RUNTIME_ARCHIVE_INVALID` with `runtimeRole=services` at the immediate `node.exe` check inside the staging directory. The run stopped there; `up` and all later lifecycle commands were not executed.
- Cleanup removed all verifier execution roots and isolated resources. `originalStatePreserved=true`; the Agent and six declared volume manifest pairs are equal, default services remain stopped, the undeclared legacy volume remains present and ReleaseIdentity remains frozen at `19e031c7acb27b75e41183dedcbb19f49f0ec5fedc3c43f829ec883441be0007`.
- Since both archive extractors reached the same redundant pre-move file check while focused extraction and exact version probes passed, the check was replaced with one archive-directory layout assertion. Runtime validity is now decided only after the atomic move by executing the fixed binary and matching its manifest version. No delay, retry, alternate extractor or fallback was added.

This attempt earns clean-clone preflight, restoration and focused runtime-provisioning CONTRACT evidence only. S4 remains `ACTIVE`; the final-version implementation awaits a new checklist-start execution.

## S4 sixth clean-clone execution stopped at the prepare deadline (2026-09-01)

- Run `agent/runs/rf027-s4/20260901-221736` enumerated 1873 files and created clean candidate commit `9c85f5130ed5afedd02221aa00e5fd066674fd29` with tree `70b8041143c0be2a177332313abb893e398bd0c1`. The clone contained no credentials, Agent runtime, browser packages or portal `dist`.
- The final Node version implementation passed the former fast-failure window and kept `prepare` running until its fixed 1800-second deadline. The verifier returned `DEMO_CLEAN_CLONE_COMMAND_TIMEOUT`; stdout and stderr remained empty because `prepare` emits only its terminal JSON. No `up`, service health or later checklist command ran.
- The verifier killed only its timed-out child, executed cleanup, removed all isolated execution roots and reported `originalStatePreserved=true` and `isolatedResourcesRemoved=true`. Default projects remain stopped, the original Agent and six declared volume manifests remain equal, the undeclared legacy volume remains present and ReleaseIdentity remains `19e031c7acb27b75e41183dedcbb19f49f0ec5fedc3c43f829ec883441be0007`.
- The exact long-running phase cannot be inferred from zero-length terminal files. A secret-free `banksystem-demo-prepare-progress/v1` record now writes only a fixed phase name and UTC timestamp under the temporary clone's Agent runtime state. The verifier copies that record into the run evidence before cleanup and projects `prepareLastPhase`; it does not capture commands, arguments, URLs, model values or logs.

This attempt earns clean-clone preflight, timeout and restoration evidence only. S4 remains `ACTIVE`; the progress-instrumented implementation awaits a new checklist-start execution.

## S4 seventh clean-clone execution identified the Node archive downloader (2026-09-03)

- Run `agent/runs/rf027-s4/20260903-100653` started from the current unchanged authority, enumerated 1873 files and created clean candidate commit `5a7a9cffbc7cfc0f53c08cee791f0f75ab106544` with tree `13c3e2237257afae1ed1695a9a17fc507d5ba033`. Prebuilt and private runtime state remained absent.
- The secret-free progress record remained at `prepareLastPhase=NODE_RUNTIMES`. Read-only file metadata showed the Node 20 archive had been created at zero bytes and made no write progress. A HEAD request to the same official URL returned HTTP 200 in 694 ms, while a single bounded `curl.exe` GET completed 30,283,903 bytes in 2.4 seconds and matched the frozen SHA-256.
- This established the first invalid boundary as the hidden child process's `Invoke-WebRequest` body download. The exact child bound to this run's cloned `demo.ps1 prepare` was stopped, after which the outer verifier completed its normal cleanup. The result reported `originalStatePreserved=true`, `isolatedResourcesRemoved=true`, zero remaining temporary execution roots and no product lifecycle progress beyond `prepare`.
- Node runtime acquisition now uses one Windows 11 `curl.exe` path with `--fail`, redirect following and a 120-second hard limit. The old downloader is removed; no retry, alternate source or fallback exists. Archive SHA, `tar.exe` extraction and post-move exact Node version checks remain mandatory.
- Focused one-request probes under the same 120-second contract downloaded Node 20.20.2 in 2,413 ms (30,283,903 bytes) and Node 24.19.0 in 2,522 ms (37,304,352 bytes); both matched the manifest SHA-256 values. `runtime-download-probes.json` and both archives remain in the failed run directory as diagnosis evidence.
- Post-cleanup readback matched all seven before/after manifests (Agent plus six declared volumes), found no owned child process, isolated container or execution clone, preserved all six declared volumes and the undeclared legacy volume, and left both default Compose projects stopped. Status remains `NOT_READY`, Agent `NOT_RUNNING`, ReleaseIdentity `FROZEN` at `19e031c7...be0007` and model binding `BOUND`.

This attempt earns downloader diagnosis, focused network CONTRACT and restoration evidence only. S4 remains `ACTIVE`; the bounded downloader has not yet passed the complete clean-clone checklist.

## S4 independent clean-clone closure (2026-09-03)

- Runs `20260903-135251`, `20260903-135750`, `20260903-140050`, `20260903-140440` and `20260903-140734` narrowed the Node boundary from downloader completion to `Win32Exception_2`. The manifest path replacement used two literal backslashes: PowerShell file APIs accepted the path while process creation did not. `DirectorySeparatorChar` plus a direct `.NET Process` version readback removed the ambiguous native pipeline without adding retries.
- Run `20260903-141023` stopped at the first Customer Portal image build failure. The identical build and one `--no-cache` build both then exited 0, so no retry or mirror behavior was added to product code.
- Run `20260903-141957` reached `RELEASE_IDENTITY` and proved the clean clone lacked `dist/harness/src`. `prepare` now installs the Agent root lockfile and generates its TypeScript `dist` before identity calculation.
- Run `20260903-142539` reproduced `better-sqlite3` installation under system Node 24.15.0. A focused isolated install proved that prepending the frozen Node 20 directory during Agent npm install/build selects the governed ABI and installs the native binding; the process PATH is restored afterward.
- Run `20260903-143009` first achieved `prepare=PREPARED` and then stopped at Channel startup. Run `20260903-144031` captured the live health cause as `UnknownHostException: mifos-isolated-activemq-1`; the Bank Channel now uses the stable Compose service alias `activemq`.
- Run `agent/runs/rf027-s4/20260903-144753` returned `status=PASS`. It enumerated 1873 files, created candidate commit `bc00013dbdb118b3c45a4037357709a14a2fd87b` with tree `548c858aea57c561f7a78d9a3a4ffa14ec46d235`, began with no private or prebuilt runtime state, and ended with `finalCloneClean=true`.
- The complete lifecycle was `prepare=PREPARED`, `up=READY`, `status=READY`, `down=STOPPED`, followed by successful isolated reset. Candidate ReleaseIdentity was `3f5236088ebe62a86c11077ffc72852df63160dbfb8ae6f0bf08924d6c219b33` with the configured model binding.
- Cleanup reported `originalStatePreserved=true` and `isolatedResourcesRemoved=true`. The original Agent manifest remained `9354435651b8a4750a19956efc831871e7e007af9df941346f63d78fa66f1e25`; all six declared volume manifests remained equal to the S3-restored baseline and the undeclared legacy volume was preserved.

RF-027-S4 is `COMPLETED`, RF-027 is `ACCEPTED`, and A02 is in `REVIEW`. This earns local independent clean-clone `INTEGRATION` only; it does not prove GitHub/new-machine reproduction, bank golden-path behavior, model LIVE_E2E, Full18, human acceptance or release readiness.
