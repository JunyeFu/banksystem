---
id: DOC-ARCH-RF047-EVIDENCE-INDEX
title: RF-047 evidence-index
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-08
owner: Codex
---
# RF-047 evidence-index

Status: S1 engineering-complete / REVIEW. S2/S3 LIVE authorized on 2026-09-08; S2 BLOCKED on exact Journey bootstrap approval, S3 waits for S2 PASS.

- STATIC: generate:dist and typecheck exit 0; RF-047 governance and documentation validators PASS.
- CONTRACT: `runtime/node-v20.20.2-win-x64/node.exe --test scripts/verification/agent-l1-live.test.cjs`, 21 tests, 21 pass, 0 fail. CLI spawn is intercepted in the transport contract test; managed lifecycle and model/browser execution are not performed.
- CONTRACT / INTEGRATION: the initial combined L1, Full18 and Harness artifact-verifier run passed 35/35. The final registered suite after the additional source-drift test passed 654/654, exit 0.
- Machine-generated result: `agent/runs/rf047/offline-final.json`, observed `2026-09-08T02:19:57.676Z`; initial 653-test result is preserved separately as `offline-result.json`.
- Final identity before/after the registered run: `445ed03a549202b32083e4a42c4d6ff7ede2550ab72a43bcc34905b30d6e2bcf`. RF-046 identity `184244a3...47cc0` is historical, not revalidated for this source revision.
- Managed process checkpoint, L1 checkpoint and Full18 ledger were absent before and after tests; runtimeStateUnchanged=true and sourceIdentityUnchangedDuringTests=true. Owned HTTP ports remained unbound.
- Read-only `npm.cmd run preflight:agent:l1` returned READY, NORMAL_CLI, flowiseAbsent=true, executionPerformed=false under the final identity. This is package/identity preflight, not six-service business readiness or LIVE acceptance.
- No service start, external model call, banking write, formal L1 execution, Full18 record or release GO occurred. Runtime authorization was not rebound.

## Authorized LIVE attempt 001

- Prior bullets describe S1 only. User subsequently authorized input freeze and S2/S3 LIVE.
- `demo.ps1 prepare` returned PREPARED, identity `445ed03a549202b32083e4a42c4d6ff7ede2550ab72a43bcc34905b30d6e2bcf`, model `deepseek-v4-flash`; endpoint hash `a34e2a4708ed1c61008a151688838dcf1c44d4e7f08054633e72ba7c0b16cfc1`.
- Freeze record: `agent/runs/rf047/live-001/freeze.json`, timestamp `2026-09-08T02:33:58.389Z`.
- Text-only SHA-256: `3613538986dd89003ef822c4aa9705c2418bea10303f70b032dda418b56845f1`.
- Image-variant text SHA-256: `0eccda649ab764b9c475463c830af1f6b95fb2182cfe3ea641ab0317f810c9b8`.
- Synthetic requirements PNG SHA-256: `86cc4d95e983997f4d28497d10cdc8d60379b816ad33a5a0bb8b196d6ab35043`.
- Complete input-contract SHA-256: `4c11a644fc4e0460c30df23ddefd9fb484ae0a9feb80638831bc1c68801c3bde`.
- Execution entry: bundled Node 24 runs `agent/runs/rf047/live-001/run-live.cjs run`, delegating directly to the public L1 checkpoint driver with frozen inputs. No automatic approvals, retries, alternate runner or evidence-result mutation.
- Runtime: `demo.ps1 up` returned READY under the frozen identity; public `hz-agent doctor` returned READY for model, Harness, MCP, Worker, browser and bank, exit 0.
- TEXT_ONLY driver returned AWAITING_APPROVAL, exit 0; projection retained in `agent/runs/rf047/live-001/result-1788834981230.json`. This is an approval checkpoint, not an executed test or a PASS.
- Pending action: create the authoritative Journey for the new CLI session. Risk LOW. Session `session-bd79a0c543c824c3e6c23b0bf8f361f2`; bootstrap placeholder `journey-bootstrap-2c2ba27e-2b67-4e93-91b6-2f3533e27c21`; proposal `proposal-6c617a3f91bddd3a309c34ac`; content hash `6c617a3f91bddd3a309c34ac4ffb18bac7753da6612b7685f051d6d0f820aeb0`; expiry `2026-09-08T02:41:18.191Z` (10:41:18 Asia/Shanghai).
- No authoritative Journey, browser Run or Task has yet been created by this proposal. S3 not started; Full18 and release GO not earned. Driver stopped its managed Agent services when returning the approval checkpoint.
- `demo.ps1 down` returned STOPPED, volumesPreserved=true; Agent was already stopped by the L1 driver. Bank containers were stopped and removed by the owned lifecycle; data volumes, credentials and evidence were retained.
- After explicit human approval, use `run-live.cjs approve session-bd79a0c543c824c3e6c23b0bf8f361f2 proposal-6c617a3f91bddd3a309c34ac 6c617a3f91bddd3a309c34ac4ffb18bac7753da6612b7685f051d6d0f820aeb0` with the same bundled Node 24, frozen inputs and owned bank services READY. An expired proposal must not be replayed or silently replaced.
- 2026-09-21 approval follow-up stopped before execution: `demo.ps1 up` left core containers running but channel readiness was false; `demo.ps1 status` reported `NOT_READY`, then `demo.ps1 down` stopped all owned containers. The approved proposal was not consumed, no Journey/Run/Task was executed, and S3 was not started. Failure record: `agent/runs/rf047/live-001/failure-bootstrap-20260921.json`.

## Authorized LIVE attempt 002

- 2026-09-21 P0复核证明前一条“渠道未就绪”是在 `demo.ps1 up` 尚未退出时取得的中途状态；完整等待后 `up`、`status` 与 `hz-agent doctor` 均为 `READY`，随后 `down` 保留数据卷。
- 再次进入 S2 时，`demo.ps1 up` 完整退出码 0，身份仍为 `445ed03a549202b32083e4a42c4d6ff7ede2550ab72a43bcc34905b30d6e2bcf`。
- TEXT_ONLY 在首个确定性边界返回 `AGENT_L1_CHECKPOINT_REQUIRES_DECISION`，退出码 1；不可变失败记录为 `agent/runs/rf047/live-001/failure-1789962254669.json`。验证按规则立即停止，未调用模型、未创建新提案、未执行浏览器、未进入 S3。
- 只读检查确认占用者是 2026-09-08 的 `AWAITING_APPROVAL` 检查点：session `session-bd79a0c543c824c3e6c23b0bf8f361f2`，proposal `proposal-6c617a3f91bddd3a309c34ac`，风险 LOW，且已于 `2026-09-08T02:41:18.191Z` 过期。旧提案不得自动批准、替换或删除。
- `demo.ps1 down` 完整退出码 0，Agent 为 STOPPED、`volumesPreserved=true`。下一门是由人明确决定如何处置该精确过期提案；S2/S3 仍 BLOCKED。

## Authorized LIVE attempt 003

- 针对 attempt 002 的真实阻塞，L1 驱动新增两条状态机修复：显式拒绝后的同身份检查点允许创建新提案；身份漂移时旧检查点原子归档到历史证据目录，禁止跨身份批准或续跑。聚焦测试 23/23、RF-047 治理门通过。
- `demo.ps1 prepare` 冻结新身份 `5d01ef4853047b5c4c03c233418b356f0de58b11f9a723f6b8246e7937820511`；模型绑定未变，输入合同仍为 `4c11a644...c3bde`。旧身份和旧提案保持历史状态。
- 新 TEXT_ONLY 提案 `proposal-fc0b31bdd4c0264af0606b28`、contentHash `fc0b31bdd4c0264af0606b28461fe9a011aac6e03527e7da4260952120cb3f8f`、session `session-d96291139580653159c1a534a590bd04`，风险 LOW；用户于有效期内精确批准。
- 批准恢复在首个确定性失败处返回 `AGENT_L1_VARIANT_EXECUTION_FAILED`，退出码 1；不可变失败记录为 `agent/runs/rf047/live-002/failure-1789962768410.json`。检查点为 `FAILED/TEXT_ONLY`、结果 0 条，未进入图片链。
- 只读公共 CLI 对该 session 和 bootstrap Journey 返回 `UNEXPECTED_FAILURE`；受限诊断仅投影安全错误码，定位为 ControllerAdapter `AGENT_ADAPTER_MCP_BUSINESS_FAILED` / Harness `I10_JOURNEY_NOT_FOUND`。Harness、MCP、Worker 和银行健康检查均 READY，但当前 session 没有可回读的权威 Journey，不能安全重试或宣称执行过浏览器。
- 最终 `demo.ps1 down` 退出码 0，Agent STOPPED、`volumesPreserved=true`。S2 阻塞在 Journey bootstrap 后权威对象缺失；需要先修复 CLI/MCP 错误投影并复现 bootstrap 边界，重新冻结身份后才能再次 LIVE。

## S2 Journey bootstrap 根因与修复

- 隔离诊断 `agent/runs/rf047/root-cause-001/fresh-bootstrap-diagnostic.mjs` 使用临时 SQLite、Fresh Harness 与真实 MCP 稳定复现：CLI bootstrap 省略空 `supportingImages` 时返回 `MCP_PROTOCOL_INTERNAL_ERROR`；显式传 `supportingImages: []` 时同一工具成功创建并回读 Journey。
- 根因：MCP Schema 将 `supportingImages` 声明为 optional，处理器却要求 `undefined` 必须为数组，且抛出的无代码异常被折叠为内部错误。后续 `I10_JOURNEY_NOT_FOUND` 是未创建 Journey 的次生回读结果。
- 修复：缺失值只归一化为 `[]`，非法非数组仍返回 `I10_JOURNEY_SUPPORTING_IMAGES_INVALID`；CLI bootstrap 将安全 MCP 业务码投影为确定性错误，不再退化为 `UNEXPECTED_FAILURE`。
- CONTRACT / INTEGRATION：L1 23/23、MCP 15/15、CLI offline 17/17、Fresh Harness + real MCP 1/1、Agent CLI 全套 94/94；构建和 typecheck 退出 0。
- 冻结前完整注册门首次因包装器仍断言旧计数 16 而为 655/656；同步到新增的 17 项后包装器通过，完整注册门最终 656/656、退出 0，且 Flowise 发布状态前后不变。
- 任务细化：`agent/plans/active/rf047-s2-bootstrap-repair-task-package.md`。以上是离线修复证据，不是 S2 LIVE PASS。

## Authorized LIVE attempt 004 与第二阶段修复

- 新身份 `e0cfbcea33b85a4a32d668a10eb324323d6f76428ee451c14629be48e2f3e33d` 的 TEXT_ONLY bootstrap 提案 `proposal-dc82fd7d388b17d9a0e22e0d` 在有效期内获精确批准；批准后首个确定性终态为 `CLARIFICATION_REQUIRED`，L1 驱动返回 `AGENT_L1_VARIANT_EXECUTION_FAILED` 并立即停止，未进入图片链。不可变失败记录：`agent/runs/rf047/live-003/failure-1789964092378.json`。
- 根因：CLI `bootstrapProposal()` 仅冻结原始自然语言，没有调用现有 BYOK 作者化器，也没有向 Harness 提交 `draftJson`、`entryUrl`、`targetSystem`、`credentialRef`。Harness 按作者化合同返回 `NEEDS_INPUT`，CLI 正确映射成澄清终态；这与已修复的 `supportingImages` MCP 边界是两个独立问题。
- 修复：TEXT_ONLY bootstrap 在首次审批前从显式目标描述取得入口、目标系统和凭据引用，调用现有 BYOK 作者化器生成草案，并将完整参数纳入审批哈希；bootstrap 获批后直接投影 Harness 的精确案例审批，不再让 Controller 对已就绪 Journey 重新规划。
- CONTRACT / INTEGRATION：CLI offline 17/17、Fresh Harness + real MCP 1/1、Agent CLI 全套 94/94、L1 驱动 23/23，RF-047 架构范围校验 PASS。Fresh Harness 测试通过受控凭据 API 写入纯合成凭据，权威 Journey 终态为 `READY_FOR_CASE_APPROVAL/AWAITING_USER`。
- 完整注册门 656/656、构建、typecheck、文档校验和 RF-047 架构校验均退出 0；Flowise 历史发布文件在注册门前后字节不变。
- `demo.ps1 prepare` 冻结修复后新身份 `b198b1d376c6f0f1ac7f836a9be269c6a844c1bcc3ebf4b8428b0ff7a4eb65ce`；模型仍为 `deepseek-v4-flash`，base URL hash 仍为 `a34e2a4708ed1c61008a151688838dcf1c44d4e7f08054633e72ba7c0b16cfc1`。未启动服务、未运行 LIVE、未创建或批准新提案。
- 以上仍是离线修复证据。源码变化必须生成新 ReleaseIdentity；S2 保持 BLOCKED，直到新身份 TEXT_ONLY 的 Journey、Run、Task 与五类证据全部通过。

## Authorized LIVE attempt 005（目录 live-004）与案例审批路由修复

- `b198b1d376c6f0f1ac7f836a9be269c6a844c1bcc3ebf4b8428b0ff7a4eb65ce` 下，bootstrap 提案 `proposal-94d0710ce13bcc25ef20b3e0` 获批后成功创建权威 Journey `journey_bb72e66f-d033-4dfa-b991-9184a181bda4`，并产生 Harness 精确案例提案 `proposal_13b05ef787531411148358386296723a`。这证明上一阶段的完整 bootstrap 根因已修复。
- 用户批准案例提案后，TEXT_ONLY 在批准写入 Harness 前返回 `AGENT_L1_VARIANT_EXECUTION_FAILED`，exitCode 4、`UNEXPECTED_FAILURE`；不可变失败记录为 `agent/runs/rf047/live-004/failure-1789972344805.json`。验证立即停止，未进入图片链；`demo.ps1 down` 保留数据卷。
- 只读 session 事件检查显示只有 `RUN_STARTED`、bootstrap `APPROVAL_PENDING`、`JOURNEY_BOOTSTRAP_RESOLVED` 和案例 `APPROVAL_PENDING`，没有 `APPROVAL_RESOLVED`。根因是通用 `resume()` 把 Harness 案例提案误送给 Controller 私有提案仓；该仓只认识 Controller 自己冻结的提案。
- 修复：案例提案写入明确 source；恢复时复用现有 Harness 权威 `journeyDecision()` 精确元组提交，再进入既有 `journeyExecute()`。Worker 轮询现在等待 `SUCCEEDED/FAILED/BLOCKED/CANCELLED` 终态，不在 `RUNNING` 时提前返回完成。
- CONTRACT / INTEGRATION：新增案例批准到浏览器终态回归；Agent CLI 95/95、L1 合同 23/23、typecheck 退出 0。完整注册门 656/656、退出 0，Flowise 历史发布状态前后不变。
- 本段仍是失败证据与离线修复证据，不是 S2 PASS。源码已变化，旧身份和旧批准不得续跑；S2 继续 BLOCKED，等待重新 `prepare`、冻结新 ReleaseIdentity 后从 TEXT_ONLY 起点复验。

## Direct execution policy change

- 2026-09-21 project-owner decision: remove both user-facing bootstrap and case-approval gates from the production `hz-agent` run path. Natural-language input is authored by the bound BYOK model, submitted to Harness, case-approved through the exact current Journey tuple, and sent to Worker in one controlled run.
- Preserved invariants: Harness remains the sole Journey/Run/Task writer; credentials remain DPAPI `credentialRef`; ReleaseIdentity, idempotency keys, target-profile checks, terminal Worker state and five evidence kinds remain mandatory. A failed or non-terminal Worker task never becomes success.
- The prior `a249ab...` freeze is stale because this policy change is ReleaseIdentity-governed. A new identity must be prepared before any LIVE attempt. Existing manual-approval evidence is historical and cannot be reused.

## Direct execution LIVE attempt 006

- New identity after the policy change: `3e2e6379c3f5fba3235105ed70aa0efd7858a0efc3af11578173775232c90d69`; input contract remained `4c11a644...c3bde` and model binding remained `deepseek-v4-flash` with base URL hash `a34e2a47...cfc1`.
- `agent/runs/rf047/live-006/run-live.cjs run` created no user-facing approval checkpoint. The Agent authored the Journey, submitted the exact Harness case decision, entered Worker execution and stopped at the first terminal failure.
- Immutable failure: `agent/runs/rf047/live-006/failure-1789973911227.json`, error `I10_TARGET_UNREACHABLE`, variant `TEXT_ONLY`, exitCode 4. No `TEXT_WITH_IMAGE` execution occurred; no PASS or Full18 claim was written.
- After the owned bank services and browser target were made ready, the same frozen identity was rerun once from the archived failed checkpoint. The direct path again created no user-facing approval checkpoint and reached Harness candidate execution.
- The first subsequent deterministic failure is immutable at `agent/runs/rf047/live-006/failure-1789974951422.json`: `I10_GENERIC_LOGIN_REJECTED`, variant `TEXT_ONLY`, exitCode 4. The authoritative Journey is `journey_21c59196-6394-4fc2-82bf-ba75c6e5812d`, stage `FAILED_ACTIONABLE`, status `FAILED`, with `nextAction=RETRY_AUTHORING`; no Worker task was created and the diagnostic records `model_status=NOT_CALLED`. Read-only credential verification proved the same `credentialRef` resolves and obtains a Keycloak password-grant token successfully. Root cause is the frozen Generic Web target profile: its only allowed runtime origin is `http://127.0.0.1:18082`, while the portal password-login implementation calls the declared local identity provider at `http://127.0.0.1:19000`; the generic browser route therefore aborts the token request, leaves the page on `/portal/login`, and the authoring guard reports `I10_GENERIC_LOGIN_REJECTED`.
- Verification stopped at this first deterministic failure. No `TEXT_WITH_IMAGE` execution, PASS, Full18 result or release GO was earned. S2 remains BLOCKED pending a repair that declares the identity-provider dependency through the approved target/adapter binding, followed by a new input contract, ReleaseIdentity and frozen run; historical failures and checkpoints remain preserved.

## Direct execution LIVE attempt 008

- 修复身份 `b5b5fdb80a650442bf68f939d8c89d423782f0f2b289eafc57c5511f0e68d7c6` 的冻结输入已明确选择 `fuxing-bank-demo` 适配器；这次修复已越过上一阶段的 Generic Web 登录拒绝边界。
- 首个确定性失败记录为 `agent/runs/rf047/live-008/failure-1789976428395.json`：`I10_TYPED_BUSINESS_INPUT_REQUIRED`，变体 `TEXT_ONLY`，exitCode 4。按照授权规则立即停止，未执行 `TEXT_WITH_IMAGE`，未产生 PASS、Full18 或 GO。
- 根因：案例目标明确为只读个人资料校验，原文包含“只读范围，不修改资料或发起转账”。`requestsTransferAction()` 的否定识别只覆盖紧邻动词形式，误把该句中的“发起转账”判定为转账请求，强制切换 `TRANSFER_UKEY_ORDER_QUERY`，随后要求不存在的 TypedBusinessInputs。
- 最小修复：扩展否定范围到同一中文短句内的“不/未/不得/禁止 … 转账/汇款/付款”，保留真实转账动作的正向识别；新增回归测试覆盖该精确句式。构建与转账意图分类测试通过，Agent CLI 95/95 通过。
- 本段是失败与离线修复证据，不是 S2 PASS。修复已改变源码，必须重新 `prepare` 冻结新 ReleaseIdentity，并从 `TEXT_ONLY` 起点重新验证；`live-008` 不得重跑，所有历史失败、证据和卷保持不变。

## Direct execution LIVE attempt 009

- 新身份 `007608a17de8073290fd8583c6099303bb8f084d310c391eba09a15ea1d9c214` 的 TEXT_ONLY 已通过完整证据门：`journey_4d2677ea-49c0-41af-b5a4-91cc1458f834`，Run `run_dea50a3a-b8cb-4fac-89c6-e4f1abeaf803` 为 `PASSED`，Task `task_9500f2dc-e86e-4f5b-be3e-ec438dea38e0` 为 `SUCCEEDED`，DOM、SCREENSHOT、TRACE、NETWORK、LEDGER 五类摘要均 `VERIFIED`。
- 随后的首个确定性失败发生在 `TEXT_WITH_IMAGE`。权威 L1 检查点 `platform/hengzhun-regression-system/.data/runtime/agent-l1-state.json` 将身份置为 `FAILED`、`currentVariant=TEXT_WITH_IMAGE`，并明确没有产生第二个变体的成功结果；镜像变体未再重跑。对应记录：`agent/runs/rf047/live-009/failure-1789976860015.json`。
- 因驱动进程在写出终态 JSON 前退出，当前可确认的错误边界是 `AGENT_L1_VARIANT_EXECUTION_FAILED`（`exitCode/terminalType/messageCode` 未被驱动保留下来）；不得把该变体解释为 PASS，也不得声称 Full18 或发布 GO。下一步应先补齐图片变体的可观测失败原因，再以源码变化后的新 ReleaseIdentity 从 TEXT_ONLY 重新开始。
- 根因清单：`docs/architecture/refactoring/batches/RF-047/root-cause-list-live-009.md`。主根因已确认是图片附件未进入 `image_ingest_submit → image_ingest_get → image_ingest_decision_submit` 生命周期；修复已落盘，次级问题是驱动未保留子进程终态细节。

## Direct execution LIVE attempt 010（修复后环境阻塞）

- 修复身份 `f9ec61a992039b61d24b7f4ab6b0113909593770cbb3428683836beb6fddbf85` 已冻结。
- 首个变体 TEXT_ONLY 在银行目标未启动时失败：`I10_TARGET_UNREACHABLE`，证据 `agent/runs/rf047/live-010/failure-1789978108995.json`。状态检查确认核心与渠道容器均未运行。
- 按规则停止，未执行 TEXT_WITH_IMAGE；该身份不能用于判定图片修复成败。下一次 LIVE 必须先完成银行服务健康检查，再由源码变化后的新身份从 TEXT_ONLY 起点开始。

## Direct execution LIVE attempt 011（公共版本回读阻塞）

- 为补齐 L1 驱动终态诊断并包含图片链修复，`demo.ps1 prepare` 冻结新身份 `434466c57f23746d4197bf74734fb754d3428280252e55cb1633c2760dfa26a8`；模型绑定未变。
- 银行核心、渠道、Harness、MCP、Worker 均启动，目标健康检查通过后开始 L1。
- 在首个 TEXT_ONLY 场景的公共版本回读阶段确定性失败：`AGENT_L1_PUBLIC_READBACK_INVALID`；不可变记录为 `agent/runs/rf047/live-011/failure-1789979712740.json`。
- 按首次确定性失败规则立即停止，未执行 TEXT_ONLY 业务动作，也未执行 TEXT_WITH_IMAGE；没有 PASS、Full18 或 GO 结论。
- 同次离线验证已通过 `generate:dist`、typecheck、Agent CLI 69/69；仍需修复公共版本回读边界后重新冻结身份。
- 后续离线修复已将 JSONL 回读逐行做 BOM/空白归一化，`generate:dist`、typecheck、Agent CLI 69/69 全部通过；该源码变化使 `434466c5…26a8` 失效，下一次 LIVE 必须以新身份重新从 TEXT_ONLY 开始。

## Direct execution LIVE attempt 012（公共版本回读再次阻塞）

- 新身份 `1ab9dc8669d32038a09d1cdd11033de96fa1982c21c8e19a34c56fcc4a8be6bf` 在银行服务 READY 后重新冻结并启动。
- 首个确定性失败仍为 `AGENT_L1_PUBLIC_READBACK_INVALID`，证据位于 `agent/runs/rf047/live-012/failure-1789980206320.json`（由 run-live 生成的同目录失败记录）。未进入 TEXT_ONLY 业务动作和图片场景。
- 后续离线修复把公共版本回读改为逐行忽略非 JSON 噪声、只接受 `COMMAND_RESULT`；直接调用 `publicVersionReadback` 已成功读回 `CONTROLLER_V2_BOUND`。源码再次变化，必须重新 prepare 冻结身份后才可继续 LIVE。
- 修复后 `demo.ps1 prepare` 已冻结身份 `614cceb0f553e03bba7d0716f74ba8295f26ba785d3b67705a14d52867ee9985`；当前 Agent 与银行均已停止，LIVE 尚待该身份重新执行。

## 服务保活修复

- 根因是执行后的显式 `demo.ps1 down` 与 L1 驱动无条件 stop；已加入 `HENGZHUN_KEEP_MANAGED_SERVICES=1` 保活路径，并在 LIVE 运行目录启用。
- 修复后重新 `prepare` 并 `up`，当前身份 `76c9433516ced9ca755b932a4d5060f0160315d3f99e196ff45c2e14ac41e264`。
- 当前 `demo.ps1 status` 返回 `READY`：银行核心/渠道和 Harness、MCP、Worker 全部健康；本次没有执行 `down`。

## Direct execution LIVE attempt 014

- 身份 `31fc74b0e49d315d478ef00ba45b694d41ef46b5ff2bc84227e813b640668ff3` 下 TEXT_ONLY 完整通过，五类证据 VERIFIED。
- TEXT_WITH_IMAGE 首次失败为 `JOURNEY_EXECUTION_FAILED`，底层 Worker 记录 `I10_MIDSCENE_LOCATOR_MISMATCH`；证据：`agent/runs/rf047/live-014/failure-1789981600019.json`。
- 继续验证立即停止，未宣称图片通过或 Full18；服务保活状态保持 READY。

## Direct execution LIVE attempt 015

- 图片事实模型配置修复后，身份 `0c7194b306f036c33f0428b3cff6d15ab1b8f636f5bde95e568e1e33b8853d88` 下 TEXT_ONLY 再次通过完整证据门。
- 图片导入已越过控制模型调用边界，但 TEXT_WITH_IMAGE 在浏览器执行阶段失败：`JOURNEY_EXECUTION_FAILED`，Worker 底层记录 `I10_MIDSCENE_LOCATOR_MISMATCH`；证据：`agent/runs/rf047/live-015/failure-1789981600019.json`。
- 首个确定性失败后停止；证据：`agent/runs/rf047/live-015/failure-1789981939414.json`。银行 Docker 与 Agent 服务仍保持 READY。

## 2026-09-22 Docker Desktop 恢复与常驻状态复验

- Docker Desktop 因 stale Secrets Engine socket `C:\Users\fujunye\AppData\Local\docker-secrets-engine\engine.sock` 及旧 Inference socket 启动崩溃；未执行 factory reset、卷删除或历史证据清理。故障目录已改名保留为 `.stale-20260922`。
- Docker Engine `29.6.2` 恢复后，本地业务镜像缓存缺失；重建 `bank-channel-service`、`mock-clearing-service`、`customer-portal`、`operations-console`。首次 operations-console 构建因 npm registry 空闲超时失败，重试成功。
- 通过 `compose.channel.yaml up -d --wait --no-build` 恢复 11 个渠道容器；清理 Docker 重启遗留的已停止 Agent 进程状态后重新启动 Harness、MCP、Worker。
- 当前 `demo.ps1 status` 返回 `READY`，ReleaseIdentity 仍为 `0c7194b306f036c33f0428b3cff6d15ab1b8f636f5bde95e568e1e33b8853d88`。本记录不改变 LIVE-015 的首次确定性失败结论，未重跑该身份。

## Direct execution LIVE attempt 016

- 针对 `HEADER_DISPLAY_NAME` 视觉误定位补充排除头像/菜单容器的提示约束，并通过语法门及 13 项 Midscene 回归后，重新 `prepare` 冻结身份 `af995f19df3b9277de715c7473493c29c4b99ae39dd11a3dd92ab387acfba1f4`。
- L1 TEXT_ONLY 首个确定性失败：`AGENT_L1_VARIANT_EXECUTION_FAILED`，底层 Worker 为 `I8_CANDIDATE_BUILD_FAILED` / Playwright `page.waitForURL` 在登录提交后等待 `/portal/dashboard` 超时 30 秒；诊断任务 `buildjob_59b32f27-e9e7-4d7a-9fa6-ecc3bfacf34c`。未执行 TEXT_WITH_IMAGE，未产生 PASS、Full18 或 GO。
- 当前服务仍保持 READY；该身份已停止验证，下一步需先定位登录提交后的路由/认证链，再以源码变化后的新身份重新从 TEXT_ONLY 开始。

## Direct execution LIVE attempt 017（凭据持久化根因）

- 新身份 `fd42345f2c39715afb8ff3837d9c6f5e77ba8b262017308cbd4388a4272d1fa8` 下，TEXT_ONLY 首次确定性失败：`AGENT_L1_VARIANT_EXECUTION_FAILED` / `JOURNEY_EXECUTION_FAILED`；Keycloak 日志为 `LOGIN_ERROR user_not_found`，权威案例仍绑定旧 `credential_6c48…`，而启动脚本每次创建新用户和新 `credentialRef`。
- 根因修复：启动播种改为解析 L1 权威案例的固定 credentialRef，按现有凭据恢复用户身份，避免案例定义与 Keycloak 用户漂移；增加只读凭据解析脚本与重复用户复用。
- `live-017` 不重跑，失败证据保留；修复后必须使用新 ReleaseIdentity。

## Direct execution LIVE attempt 018

- 修复后新身份 `908d842d4673c2402d5007bbecfefab4320d14ecffb2e144a31021c6bc170a1b` 冻结成功，银行、Harness、MCP、Worker 全部 READY。
- `TEXT_ONLY` 与 `TEXT_WITH_IMAGE` 均 `PASSED`，Journey 均终态 `COMPLETED`，Run 均 `PASSED`，Task 均 `SUCCEEDED`；两变体均具备 DOM、SCREENSHOT、TRACE、NETWORK、LEDGER 五类 `VERIFIED` 证据。
- 结果文件：`agent/runs/rf047/live-018/result-1790043785184.json`。本次仅完成 L1 双变体，不代表 Full18 或发布 GO；Docker 与 Agent 服务保持运行。

## Direct execution Full18 continuation 019

- L1 双变体已在新身份 `908d842d4673c2402d5007bbecfefab4320d14ecffb2e144a31021c6bc170a1b` 下通过；继续执行 `i10-18-chain-acceptance-live.cjs run L2 TEXT_ONLY`。
- 首个确定性失败立即停止：`fetch failed`，记录目录为 `platform/hengzhun-regression-system/.data/evidence/i10/acceptance-records-v3/runs/record-l2-text_only-2026-09-22T02-53-11-817Z-fee744`。
- 根因边界：Full18 旧链路仍直接调用已退出交付链的 Flowise 公共预测端点；当前产品主链已切换为 `hz-agent CLI → Controller → MCP → Harness → Worker`，因此 L2 旧驱动不能作为当前 Agent 产品的正式执行器。未执行 L2 图片变体及后续场景，未产生 Full18 或 GO。
- Docker、Harness、MCP、Worker 保持运行。下一步需把 Full18 驱动改接当前 CLI/Harness 公共合同后，再冻结新身份继续。
### LIVE-019：CLI evidence 终态投影根因修复（2026-09-22）

- 旧 v3 `i10-18-chain-acceptance-live.cjs` 仍调用 Flowise/public prediction，`fetch failed`；该驱动不再属于当前 CLI 产品路径。
- 当前 CLI Full18 的确定性失败根因已确认：Harness `interactionEnvelope()` 未发布 `terminal`，`artifactCards()` 未包含 `references.resultArtifactId`，导致 `hz-agent evidence` 投影为 `terminal=false` 并触发 `AGENT_FULL18_JOURNEY_NOT_TERMINAL`。
- 修复文档：[repair-control-live-019-cli-evidence.md](repair-control-live-019-cli-evidence.md)。
- 修复已落到 Harness 权威源并执行 `generate:dist`；新身份 `ed344f8d773ce5c84c4e0b1164fcc674b6cd334643cd84e0f903b0833d83402f`。
- 修复后 CLI evidence 回读已观察到 `terminal=true`，结果制品卡包含 `resultArtifactId`；CLI 离线集成测试 17/17 通过，Full18 preflight 为 READY。
- Full18 未宣称完成；新身份必须从 L1 重新建立正式 LIVE 证据。
- 新身份已完成 L1 `TEXT_ONLY` 与 `TEXT_WITH_IMAGE`，随后 L2 `TEXT_ONLY` 首次执行返回 `AGENT_FULL18_CHAIN_EXECUTION_FAILED`；v4 ledger 已记录 `FAILED_DETERMINISTIC`，验证已停止，禁止续跑该身份。
