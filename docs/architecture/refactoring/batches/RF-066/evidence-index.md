---
id: RF066-EVIDENCE
title: RF-066 evidence index
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

2026-11-05授权面试修复增量：CLI凭据/资金参数、真实SDK分类与8192输出上限、图像来源/一次调用、HTTP下载取消及SQLite检查点客户端已实现并验证。当前H1c76996e…ca3e94d的真实只读S5完整通过；历史恢复不重派、配置/窄屏与银行快照通过。原银行15容器保持运行，未自动提交发布，正式28项未提升。详见[逐问题与逐身份回执](../../../../evidence/platform/agent-interview-repair-2026-11-05.md)。下列记录保留为其原日期的历史证据。

2026-10-24本轮Worker明确SSO入口语义匹配修复完成，正反例与真实隔离DOM通过；Worker61、Contract19＋11、Integration41＋1、CLI76及源码另轮复审通过，源码门DONE。S5统一冻结H7a722b08…525239重跑遇到新的Harness认证未展开缺陷，首错停止，非本包源码门实机通过。详见[修复证据](../RF-068/S5-login-match-repair-20261024.md)及[首次失败根因](../RF-068/S5-live-root-cause-20261024-03.md)。

2026-10-24回接RF068-S5专项修复：CLI/Worker视觉SDK预检、嵌套模型错误分类及首错停止、视觉绑定参与身份已完成；Contract19＋11、Integration41＋1、Worker59、CLI76、Browser5及前端45/双构建通过。源码门DONE，运行验收仍归S5。候选H618b078b…93c129的托管启动被工具自动审批拒绝，尚未绑定启动或LIVE；见[专项执行回执](../RF-068/S5-repair-execution-20261023.md)。

# RF-066 evidence index

## 2026-10-23 S5就绪与取消修复回接

按用户批准的RF068-S5方案补精确lifecycle白名单后实施：归属观察与单次完整doctor分开、10秒本地健康、90秒模型边界及全链signal、具体依赖原因保留；身份纳入实际S5入口及product-doctor。Contract19＋专项9、Integration39＋runtime1、既有CLI75均通过。1800ms正常响应、真实HTTP响应体悬挂、停止期间等待/构造与未知错误族都有反例。HTTP/前端只透传既有安全错误族，原安全断言保留。源码复审通过；实机另归RF068-S5，详见[成组修复回执](../RF-068/S5-repair-execution-20261023.md)。不提升为正式28项或整体GO。

## BE-C06 frontend-consumer correction 2026-10-21

RF068-S1接线发现已观测缺陷：生产静态服务只接受/assets和index.html，无法提供既定/agent/路径的agent.html、字体与原品牌文件。依现有S2任务补项，仅修正workbench-server及其原测试：剥离/agent前缀，SPA返回agent.html，仅额外放行精确favicon.svg，保留realpath/Host/CSP/越界保护并标明ttf MIME。现有Contract入口18/18再次通过；实际打包产物由RF068隔离浏览器门回读成功。不是新增执行API或兼容控制面，没有重载生产服务、迁移原库或改写S2的历史35项回执。

## Observed in this turn

- SOURCE_ANALYSIS: existing frontend, production-service methods, encrypted store, model environment composition, Harness routing and scoped module manifest inspected.
- RUNTIME_READ_ONLY: original 15 Docker containers running; no container/service mutation.
- EXTERNAL_BLOCKER: Figma get_design_context twice and whoami once returned connector transport failures. No high-fidelity response, asset receipt, frontend implementation or live acceptance obtained.
- CONTROL_DOCUMENTS: created in response to the explicit request to refine task packages. Commands below are recorded only after actual execution.

## Control verification 2026-10-19

- Initial control check failed: six modules exceeded the two-module budget and the future OpenAPI file did not yet exist. No product implementation followed that failure.
- Corrected into RF066/RF067/RF068 with five task packages and acyclic slice-level dependencies; the user chose waiting for Figma restoration.
- Actual `python scripts/architecture/validate_refactoring.py --batch RF-066`: exit 0, REFACTOR_VALIDATION=PASS.
- Actual `python scripts/docs/validate_docs.py`: exit 0, DOC_VALIDATION=PASS metadata=751 links=243.
- These results establish control/document consistency only. Product source, frontend runtime, model configuration, transactions and service lifecycle remain untouched.

## Not complete at S1 entry (historical)

Persistence/API composition, model configuration, Agent UI build, browser integration and real BYOK acceptance remain unimplemented. No new ReleaseIdentity, current-identity LIVE or release GO is claimed.

## S2 implementation, verification and review — 2026-10-21

This section supersedes the historical unimplemented backend/dependency statements above. The accepted S1 receipts remain historical, not replayed as LIVE proof.

BE-C01–06 are implemented in agent-cli/workbench-application, workbench-production, workbench-metadata, workbench-server, hz-agent-web, controller/model-key-store and the existing production-service. The real Controller is reused; no new planner/execution ledger. Same-submission replay reads the immutable original request; direct clarification keeps the same checkpoint/Journey, original profile version/identity and image receipt. New goals after terminal turns start separately. Missing launch inputs are NEEDS_INPUT, not a bootstrap parser crash.

Model keys use CurrentUser DPAPI with namespace-bound entropy, unique immutable key refs and no key return/history/log. Model checks probe only the selected endpoint without save/default mutation or retry. Factory startup can import the current configured model, but configuration alone is not READY: existing identity authorization, owned managed runtime and doctor gates still apply. The factory was exercised with an explicit test-only environment, not original keys or an external model.

OpenAPI1.1 is generated from HTTP schemas (15 operations). Required bootstrap reasons/result, controlled single PNG/JPEG upload, original filename receipt, evidence list and turn-owned artifact proxy are implemented. Download grants remain internal; bytes are pinned to configured loopback, redirected requests are rejected, and size/hash are checked. Actual isolated Harness/MCP import and one-time artifact download passed. Static/API CSP differ; deep links and missing dist-agent503 are exercised. Quality is untouched.

Installed drift was repaired in BOTH root and controller nested SDK directories: official1.31.0 tarball verified against each existing lock SHA-512, no install hooks/npm ci/native replacement. Source package/locks are unchanged by this repair. Recovery copies retained under `node_modules/@modelcontextprotocol/sdk-rf066-original-1.30.0-d861e32ec7814ebeaf6ce8745f453905` and `controller/node_modules/@modelcontextprotocol/sdk-rf066-original-1.30.0-3dafdf42553047748821ab7912bbab58`. A regression now resolves SDK separately from MCP, Controller and CLI entries; all match declared/locked1.31.0. The earlier root-only and RF067 isolated-mirror receipts did not prove this nested fix.

### Actual commands and results

| Evidence tier | Command (repository root; platform-relative paths prefixed by platform/hengzhun-regression-system) | Actual result |
| --- | --- | --- |
| CONTRACT | powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1 -Scope Contract | exit0; OpenAPI check;18/18 |
| INTEGRATION | same runner -Scope Integration | exit0; compile; metadata generator check;35/35, after BOTH SDK repairs |
| INTEGRATION | pinned Node24 --test agent-cli/test/offline-integration.test.mjs agent-cli/test/journey-execute.test.mjs | exit0;30/30 after nested SDK repair |
| CONTRACT | pinned Node24 --test agent-cli/test/release-lifecycle.test.mjs agent-cli/test/model-binding.test.mjs | exit0;28/28 (includes subtests and identity file coverage) |
| CONTRACT / historical STATIC | pinned Node20 --test scripts/verification/mcp-v2-decoupling.test.cjs scripts/verification/mcp-interaction-contract.test.cjs | exit0;18/18; existing39-tool checks; no Flowise service |
| CONTRACT | pinned Node20 --test scripts/verification/controller-runtime-adapters.test.cjs | exit0; wrapper1/1 asserts the existing20-case matrix passed after nested SDK repair |
| STATIC | npm.cmd --prefix platform/hengzhun-regression-system run typecheck / run check:tests | exit0;109 registered,105 CI-runnable,2 governed-runtime,2 historical-only |
| STATIC | python scripts/architecture/validate_refactoring.py --batch RF-066 and --batch RF-067 | exit0; REFACTOR_VALIDATION=PASS |
| STATIC | python scripts/docs/validate_docs.py | exit0; DOC_VALIDATION=PASS |

### Acceptance-oriented review

Separate review pass by the same executor, not a second-person/human sign-off. Found and corrected: Journey refs were retained too late on failed verification; pre-launch image clarification could drop the attachment; root SDK repair did not fix Controller's nested install. Added counterexamples for wrong-identity proof, in-flight model/key/default changes, namespace/conversation-bound lookup, unknown transport versus deterministic rejection, and no fake finished events. Host negative test was corrected to raw HTTP because fetch rewrites Host; the real server rejects it403. Updated the metadata tool-count test from10 to11 for the explicit additive contract, without relaxing the39-tool execution boundary.

The real vertical test connects isolated SQLite Harness + actual production MCP process + production Controller/DPAPI, reaching NEEDS_INPUT with zero bank runs. Deterministic models/tool fixtures remain test-process-only. No live model, bank transfer or original database was used. Isolated process cleanup stops only owned children.

### Runtime and remaining boundary

Original15 bank container IDs retained, all still running (Up31hours at final check); no down/reset/restart/rebuild/volume/date change. MCP/Controller/CLI SDKs each resolve1.31.0. Ports18788/18789/18790 have no listeners after owned test cleanup. Port18790 is registered/reserved; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo/agent-workbench.ps1 status` returns NOT_RUNNING. Start/stop operate only the new web process; they do not start/reload original Harness/MCP/Worker or banking services. An absent UI build is explicit503.

S2 closes source/contract/isolated integration gates and unblocks RF068-S1 only. Original DB migration/managed deployment, actual initial model import, approved frontend, browser/BYOK acceptance and overall GO remain separate; none is claimed here. The v4 manifest includes new runtime/launcher sources, but no ReleaseIdentity was frozen. Main/HEAD unchanged; no commit, push or public release.

## S1 implementation 2026-10-19

- Figma restored: full non-sparse get_design_context and screenshots for approved nodes 2:60 / 11:1017 (file AGcoUj1UHujnoV0EPhvGLN, Full-seat Figma connection). The previous connector failure remains historical evidence, not a current blocker.
- CONTRACT: 12 HTTP operations, generated OpenAPI 1.0.0/MPL-2.0 and strict request/response DTOs. Router has no planner, database or listener; RF066-S2 supplies the real composition. Frontend generated types are consumed in RF068.
- Characterization uses the real production-service and actual CurrentUser DPAPI checkpoints with test-process-only model/MCP doubles: NEEDS_INPUT makes no approve/execute call; continuation forks a checkpoint on the same Journey; aborted MCP waiting proves neither Worker cancellation nor funds rollback.
- Initial Contract runner: 13/13 passed, including unsafe response rejection, Host/Origin/CSRF, bounded input and stop semantics. First invocation without process execution policy failed because this Windows profile disables unsigned PS1 execution; rerun with `-ExecutionPolicy Bypass` passed and did not change persistent policy.
- Existing offline-integration and journey-execute regression: 30/30 passed. Registered wrapper: 1/1 passed; manifest check 106 registered / 102 CI-runnable / 2 governed-runtime / 2 historical-only.
- Final control synchronization: governance and document validation both exit 0 (REFACTOR_VALIDATION=PASS, DOC_VALIDATION=PASS metadata=751 links=243).
- RUNTIME_READ_ONLY: original 15 containers still Up 6 hours; no up/down/reset/restart, live model or banking call. Generated contract/source changes affect the next ReleaseIdentity but no identity was frozen.

S1 is complete; RF067 is the next implementation slice. These are CONTRACT/isolated integration receipts, not LIVE_E2E or release GO.

## S1 focused review

- Source-level review caught the existing bounded Harness/MCP output contract before persistence implementation. Added explicit history and event cursors; no global limit increase, text truncation or hidden execution resume.
- Regenerated OpenAPI after that correction; actual final HTTP + characterization suite 14/14 passed. The earlier 13-case receipt is superseded for this changed contract, not silently rewritten.
- The real production-service regression remains 30/30; no production-service code changed in S1. HTTP request/response tests exercise a transport factory with test-only application doubles, not an already-connected production UI.
- No dependencies installed, network listeners started, model keys loaded, containers changed, commits or pushes performed. RF067 is READY; S2 and RF068 still await their implementation dependencies rather than Figma connectivity.

## 前端接入规划细化（非实现证据）

本轮仅更新唯一顺序、backlog、任务/切片与配套设计。代码读取核实当前router仍是注入工厂、现有图片只消费第一张、证据清单与授权已有但缺浏览器代理；将这些缺口归S2具体工作与拟合同加法。S1保持已完成；没有修改OpenAPI、产品源码、依赖、模型、数据库或服务。新测试选择器/构建脚本仍为待实现，旧14/30项结果不算本轮重跑。


