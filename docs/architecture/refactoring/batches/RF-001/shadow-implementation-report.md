---
id: DOC-ARCH-RF001-SHADOW-IMPLEMENTATION
title: RF-001 B3影子适配实现报告
document_type: verification
domain: architecture
status: verified
authority: evidence
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# RF-001 B3影子适配实现报告

## 当前结论

RF-001-B3已实现第一条细链与直接编排工具切片，批次处于`IMPLEMENTING`，尚未达到`SHADOW_VERIFIED`。

本轮新增纯MCP边界模块`mcp/src/rf001-contract-adapter.cjs`，实现：

- 冻结的8字段安全错误信封；
- 当前旧错误投影；
- 旧/新投影共享语义比较；
- 只记录字段形状和SHA-256摘要的影子观测器；
- `credential_session_get`权威请求规范化。

`mcp/src/server.cjs`继续把旧投影返回给Flowise；新投影仅由`HENGZHUN_RF001_SHADOW=1`启用比较。比较使用同一次Harness响应，不会为任何读写工具发起第二次请求。

## B3-S2直接编排工具切片（2026-08-02）

新增`shadowedRequest(operation, route, payload)`包装函数，与`callHarness`共享同一次`requestHarness(route, payload)`响应：

- 成功路径：`observeSuccess(operation, body, body)`，同一对象不重写，旧输出不变；
- 失败路径：`observeError(operation, projectLegacyHarnessError(body, status), projectCanonicalHarnessError(body, status))`，记录旧/新错误投影差异；
- 包装函数体恰好包含一次`requestHarness(`，静态断言保证影子永不发起第二次请求。

8个直接编排工具的全部直达往返已接入工具级观测：

| 工具 | 接入往返数 |
|---|---|
| candidate_get | 5（candidates:get初始、authoring:get、candidates:compile、candidates:get轮询、verification:get） |
| candidate_preview | 2（candidates:get、candidates:preview） |
| task_get | 3（tasks:get、verification:get、tasks:get轮询） |
| schedule_get | 1（schedules:get） |
| result_inbox_list | 1（results:inbox-list） |
| failure_get | 2（failures:get、轮询） |
| repair_propose | 1（前置读failures:get） |
| decision_submit | 1（前置读failures:get） |

`candidate_decide`与`schedule_disable`的前置读`requestHarness`调用暂不接入（遗留项，后续切片处理）；两者的写路径仍走已观测的`callHarness`。条件写工具以“单请求、单副作用”为静态不变量：`schedule_get`块内`/v1/plugin/schedules:disable`恰好1次、`candidate_get`块内`/v1/i8/candidates:compile`恰好1次、`result_inbox_list`块内`/v1/i8/results:inbox-list`恰好1次。

当前聚焦测试：

```text
node --test rf001-contract-adapter.test.cjs mcp-interaction-contract.test.cjs
18 passed / 0 failed
```

静态合同校验：

```text
python scripts/architecture/validate_refactoring.py
REFACTOR_VALIDATION=PASS batches=2 modules=25 (exit 0)

python scripts/architecture/validate_rf001_contract.py
RF001_CONTRACT_VALIDATION=PASS tools=33 aliases=13 conditional_mutations=3 error_fields=8 (exit 0)
```

证据等级为`CONTRACT`。没有重启当前MCP进程、没有启用正式流量影子、没有切换错误输出，也没有修改Flowise、Worker、SQLite或银行模块。

改动前后只读身份对照结果：

```text
ReleaseIdentity = 632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f
identityUnchanged = true
currentPassed = 18/18
currentPassedDelta = 0
sourceHashUnchanged = true
deployedHashUnchanged = true
```

公共API回读来源仍为`CACHED_EVIDENCE_FILE`且已过新鲜度窗口；它不能作为B3运行影子或发布证据。

## 尚未满足的B3门禁

1. `candidate_decide`/`schedule_disable`两个工具的前置读`requestHarness`调用尚未纳入工具级观测（已登记为遗留项）。
2. 13项入口别名尚未逐项接入权威字段适配器与样本测试。
3. `authoring_submit`七组无效旧数组仍需确定“明确拒绝”或“接线”策略。
4. 尚未在隔离运行态启用`HENGZHUN_RF001_SHADOW=1`并获得零重复写入的真实观测记录。
5. 公共API回读证据仍过期；达到`SHADOW_VERIFIED`前必须实时刷新。

因此本轮不得声明MCP-33全部适配完成、运行态影子通过或允许切换。下一细链为全部13项入口别名接入权威字段适配器与样本测试（B3-S3）。

## B3-S3 全部13项入口别名接入权威字段适配器与样本测试（2026-08-02）

切片`RF-001-B3-S3`（`slices/RF-001-B3-S3.yaml`，APPROVED）与任务包（`tasks/RF-001-B3-S3.md`，经用户批准）已执行完成：

- **适配器**：`mcp/src/rf001-contract-adapter.cjs`新增13项别名权威投影函数——`normalizeIngestSubmitRequest`（NONE哨兵省略）、`normalizeIngestDecisionSubmitRequest`（correctionsJson/itemDecisionsJson→corrections/itemDecisions）、`normalizeJourneyPrepareDraft`（DEC-2自映射，不投影）、`normalizeCasePrepareRequest`（draftArray/draftJson→draft、multimodalContextJson合并）、`normalizeCaseAcceptanceSummary`（acceptanceSummaryJson→acceptanceSummary）、`normalizeRepairProposeRequest`（patchJson/5平铺字段→patch）、`normalizeAuthoringSubmitRequest`（DEC-1：7组数组字段登记无效果并显式剥离）、`normalizeCredentialBinding`（run_submit/schedule_create隐式i3-customer冻结绑定）；移动`parseJsonArgument`、`normalizeCasePrepareUrl/CredentialRef/ActionSteps`、`normalizeI10NaturalDraft`入适配器并回导出。
- **接线**：`mcp/src/server.cjs`删除本地重复实现（137行），8个工具入口全部改走适配器投影；旧输出与Harness载荷字节不变（移动函数先经独立沙箱语义对照`SEMANTIC_COMPARE=PASS`）。
- **合同**：`mcp-boundary-contract-v1.json`按DEC-1/DEC-2更新`until`字段（13别名计数不变）；`implementationPhase`保持`RF-001-B3_SHADOW_ONLY`（校验器冻结枚举，实施状态由本报告与决策日志记录）。
- **样本测试**：新增`scripts/verification/rf001-b3s3-aliases.test.cjs`，13项别名每项≥1样本 + 无效果断言 + 自映射回归断言 + 适配器无IO静态断言 + 接线静态断言。

```text
runtime/node-v20.20.2-win-x64/node.exe --test scripts/verification/rf001-contract-adapter.test.cjs scripts/verification/mcp-interaction-contract.test.cjs scripts/verification/rf001-b3s3-aliases.test.cjs
29 passed / 0 failed (exit 0)

python scripts/architecture/validate_refactoring.py
REFACTOR_VALIDATION=PASS batches=2 modules=25 (exit 0)

python scripts/architecture/validate_rf001_contract.py
RF001_CONTRACT_VALIDATION=PASS tools=33 aliases=13 conditional_mutations=3 error_fields=8 (exit 0)

python scripts/docs/validate_docs.py
DOC_VALIDATION=PASS metadata=132 links=169 stale_checks=1190 order_files=97 refactoring=True (exit 0)

git diff --check
PASS（仅CRLF警告，无空白错误）
```

**身份对照（受限复算）**：`inspect-i10.ps1`在当前仓库不存在（batch.yaml引用命令缺失，基线快照`C:/tmp/i10-post-backfill-baseline.json`可用）。改用快照字段离线对照：ReleaseIdentity输入（sourceFlowHash/flowVersion/harnessCodeHash/workerCodeHash/migrationVersion/caseCatalogHash）均未被本切片触碰；直接重算`agentflow-v7.json` SHA-256=`65bc36cd…b772664c`与基线`sourceFlowHash`逐字节一致，identityHash`632ad5ee…`不变。残余风险：`deployedFlowHash`与18链运行时复算需在运行态重跑`inspect-i10.ps1`或等价实时门禁，已在B3-S5前置条件中登记。

**证据等级：CONTRACT**。未重启MCP、未启用正式流量影子、未切流、未修改Flowise/Worker/SQLite/银行模块。`SHADOW_VERIFIED`仍未申请。

## B3-S4 直接编排工具前置读观测收尾（2026-08-02）

切片`RF-001-B3-S4`（`slices/RF-001-B3-S4.yaml`，APPROVED）与任务包（`tasks/RF-001-B3-S4.md`）已执行完成：

- `candidate_decide`前置读 `/v1/i8/candidates:get` 与 `schedule_disable`前置读 `/v1/i8/schedules:get` 由裸`requestHarness`迁移到`shadowedRequest('candidate_decide'/'schedule_disable', ...)`；写路径仍走`callHarness`，载荷/幂等键/错误码不变。
- `ORCHESTRATION_TOOLS`扩为10个工具；新增B3-S4断言：两工具块恰好1次`shadowedRequest(<tool>,`、写路径保持`callHarness`、错误码`I8_CANDIDATE_VERSION_UNAVAILABLE`/`I8_SCHEDULE_STATUS_UNAVAILABLE`保留。

```text
runtime/node-v20.20.2-win-x64/node.exe --test scripts/verification/rf001-contract-adapter.test.cjs scripts/verification/mcp-interaction-contract.test.cjs scripts/verification/rf001-b3s3-aliases.test.cjs
30 passed / 0 failed (exit 0)

python scripts/architecture/validate_refactoring.py → REFACTOR_VALIDATION=PASS (exit 0)
python scripts/architecture/validate_rf001_contract.py → RF001_CONTRACT_VALIDATION=PASS tools=33 aliases=13 conditional_mutations=3 error_fields=8 (exit 0)
python scripts/docs/validate_docs.py → DOC_VALIDATION=PASS metadata=133 links=169 (exit 0)
git diff --check → PASS
```

身份受限复算：`agentflow-v7.json` SHA-256=`65bc36cd…b772664c`与基线`sourceFlowHash`一致，identityHash`632ad5ee…`不变；`inspect-i10.ps1`运行时复算仍登记为B3-S5前置。

**证据等级：CONTRACT**。未重启MCP、未启用正式流量影子、未切流。至此全部10个直接编排/复合工具的前置读与写路径均有工具级观测；`SHADOW_VERIFIED`仍未申请（B3-S5未开始）。

## B3-S5 隔离运行态影子验证（2026-08-02）

切片`RF-001-B3-S5`（`slices/RF-001-B3-S5.yaml`，APPROVED，含运行态操作授权）与任务包（`tasks/RF-001-B3-S5.md`）已执行完成：

- **隔离编排**：临时随机Token（≥32 hex，不读生产凭据）；计数代理（28888）→隔离Harness（dist，28887，全新隔离DB自动迁移）→隔离MCP（28889，`HENGZHUN_RF001_SHADOW=1`，`HARNESS_URL`=代理）；全部产物在`.data/tests/rf001-shadow/`，测试结束finally清理并确认生产进程/端口未触碰。
- **流量矩阵**：16个工具调用、预期20次Harness往返（credential_session_create×3成功写、credential_session_get×3成功读、case_prepare×1、10个直接编排工具404/错误路径各1、verification_get×1零往返）。
- **零重复写入**：计数代理按route断言（sessions-create=3、sessions-get=3、cases:prepare=1、candidates:get=2、authoring:get=1、tasks:get=1、schedules:get=2、failures:get=3、runs:submit=1、authoring:submit=1、ingest:submit=1、ingest:decide=1），总往返20且无矩阵外route。
- **零投影差异**：实时MCP `/health` 影子快照 `observed=20`、`equivalent=20`、`mismatched=0`；stderr无`rf001_shadow_mismatch`事件、无Token泄漏。
- **运行时身份复算**：`node scripts/i10-release-identity.cjs` 输出identityHash=`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`，与基线一致（关闭inspect-i10.ps1缺失的受限复算缺口）。
- **公共API新鲜度**：Flowise探针（3006 `/api/v1/ping`）不可达——正式运行环境未启动，按切片约定记录确切原因，新鲜度门禁保持打开并登记为B4切流前置，不冒充新鲜证据。

```text
runtime/node-v20.20.2-win-x64/node.exe --test scripts/verification/rf001-b3s5-shadow-live.test.cjs
2 passed / 0 failed (exit 0)

回归（rf001-contract-adapter + mcp-interaction-contract + rf001-b3s3-aliases + b3s5）：32 passed / 0 failed
validate_refactoring.py / validate_rf001_contract.py / validate_docs.py / git diff --check 全部PASS
```

**证据等级：RUNTIME_SHADOW**。批次仍`IMPLEMENTING`；`SHADOW_VERIFIED`的申请口径：隔离运行态影子证据齐备，公共API回读新鲜度因正式环境未启动保持开放（如实登记），切流仍属B4。

## B4-S1 兼容与错误路径基线验证（2026-08-02）

切片`RF-001-B4-S1`（APPROVED，B4切片链规划经用户批准）已执行完成，零运行时代码改动：

- **三源核对**：`contracts/mcp/hengzhun-i8.json` ↔ `mcp-boundary-contract-v1.json` ↔ `server.cjs registerTool` 三源33工具名完全一致；13别名（alias/canonical/until三键齐全）、8字段错误信封、3个`CONDITIONAL_MUTATION`条件写工具全部与冻结合同一致。
- **错误码清单**：从server.cjs（errorCode字面量+失败关闭fallback码）与适配器（codeError）提取≥25个错误码，全部大写蛇形且均可在 matrix/合同/Harness errors/MCP边界源码中找到文档出处；每个`textResult(..., true)`错误路径均携带errorCode（失败关闭）；成功响应不带errorCode（两处例外核实为成功负载）。
- **消费者调用面**：agentflow-v7.json 全部 Tool 节点 mcpActions 调用名 ⊆ 33 工具（≥25 个不同工具被真实调用）。
- **切流前基线**：server.cjs 错误路径当前为旧投影（`projectLegacyHarnessError`）+影子比较；`HENGZHUN_RF001_LEGACY_ERROR`开关尚不存在——供 B4-S4 可测切换。

```text
node --test rf001-b4s1-compat-error-baseline.test.cjs → 5/5 (exit 0)
全聚焦测试（5文件）→ 37 passed / 0 failed
validate_refactoring / validate_rf001_contract / validate_docs / git diff --check 全PASS
```

**证据等级：CONTRACT**。B4-S1 完成；下一门禁 B4-S2（18链+公共API新鲜度回读）依赖正式环境。

## B4-S2 18链身份保持与公共API新鲜度实时回读（2026-08-03）

切片`RF-001-B4-S2`（APPROVED，用户授权启动正式环境）已执行完成，零代码改动：

- **环境启动**：`start-i10.ps1` exit=0；四服务健康（3006/18788/18789 全 200）；双模型真实探针 `mock=false/degraded=false`（DeepSeek V4 Flash + MiMo v2.5，usageReported=true）；生产 MCP 影子保持关闭。
- **公共API实时回读**（关闭 B3-S5 遗留 OPEN 门禁）：`sourceFlowSha256=65bc36cd…`、`deployedFlowDataSha256=ae3f51ac…`、`chatbotConfigHash=706f5398…` 与基线快照逐项一致；`deployed=true/isPublic=false`；`fullFileUploadEnabled=true`。
- **18链账本**：passed=18/18；L1-L3/M1-M3/H1-H3 九组全部 `SEMANTIC_MATCH`；18 条记录记录级身份全部 `632ad5ee…`、全部 PASSED。
- **身份复算**：`i10-release-identity.cjs` identityHash=`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f` MATCH。

**如实登记项**：① 18 链记录来自当日基线运行（同一身份，2026-08-02T07:18-09:16Z），本切片完成环境重启+回读+身份+账本记录级核对，未全量重跑（可另行执行）；② `ledger.json` 头部 releaseIdentity 为陈旧写入标识 `303db725…`，status 按记录级身份计算不受影响。

**证据等级：RUNTIME_LIVE**。B4-S2 完成 → 切流前置硬门禁（cutover-runbook）全部满足：合同冻结✓、兼容测试全绿✓、影子等价✓、18链无回退✓（记录级）、回滚演练=B4-S3（下一项）。

## B4-S3 回滚演练（2026-08-03）

切片`RF-001-B4-S3`（APPROVED）已执行完成，演练全程在隔离副本（`.data/tests/rf001-rollback-drill/`），真实工作区零改动：

- **触发条件**：向 server.cjs 副本注入错误码漂移（`I8_CANDIDATE_VERSION_UNAVAILABLE`→`I8_CANDIDATE_VERSION_DRIFTED`）→ B4-S1 错误码清单检测器失败（漂移可机器检测）。
- **回滚命令**：`git show dacd795:<server.cjs>` 恢复基线（预 RF-001）+ 移除 RF-001 产物。
- **恢复验证**：`node --check` 通过；无 `rf001|shadowedRequest|normalizeCasePrepareRequest|normalizeIngestDecisionSubmitRequest` 引用；33 工具完整；identityHash=`632ad5ee…` 不变；检测器恢复绿。
- **隔离断言**：演练后真实 server.cjs 字节不变、适配器仍可加载；演练目录 finally 清理。
- **测试适配登记**：B3-S5 探针测试原断言在正式环境启动后失效（FLOWISE_API_KEY 由产品脚本管理），已适配为记录式断言，意图不变。

```text
rf001-b4s3-rollback-drill.test.cjs → 2/2 (exit 0)
全聚焦测试（6文件）→ 39 passed / 0 failed
静态校验×3 / git diff --check / identity 632ad5ee… 全PASS
```

**证据等级：CONTRACT_DRILL**。**cutover-runbook 切流前置硬门禁全部满足**（合同冻结✓、兼容全绿✓、影子等价✓、18链无回退✓、回滚已演练✓）——B4-S4 切流条件就绪，待用户显式批准。

## B4-S4 切流（2026-08-03，用户显式批准）

切片`RF-001-B4-S4`（APPROVED，用户批准）已执行完成：

- **适配器**：新增 `projectCanonicalToolError`（8字段规范信封、幂等、legacy `validationIssues`→`fieldErrors`、脱敏、safeMessage/correlationRef 有界截断）。
- **server.cjs**：`legacyErrorOutput = process.env.HENGZHUN_RF001_LEGACY_ERROR === '1'`（默认关闭）；`textResult(isError)` 非 legacy 时投影规范信封；`callHarness` 失败路径输出 canonical（含 safeMessage/correlationRef），legacy 分支保留于回退路径；影子比较保留。
- **测试**：B4-S1 基线更新为切流后基线（开关存在且默认关、旧投影保留于回退路径）；新增 `rf001-b4s4-cutover.test.cjs`（信封单测+静态接线）；全聚焦 **43/43**、静态校验×3、`git diff --check` 全 PASS。
- **生产切流**：受管 stop→start（四服务健康；发布回读 sourceFlow/deployedFlowData 与基线一致）；实时探测：`task_get(404)`→`{errorCode:TASK_NOT_FOUND, category:TOOL, status:404, retryable:false, userActionRequired:false}`；`verification_get`（MCP本地错误）→同样规范信封；errorCode 权威名保留。
- **回退验证**（隔离运行态）：`HENGZHUN_RF001_LEGACY_ERROR=1` → `{"category":"TOOL","errorCode":"TASK_NOT_FOUND","status":404}` 旧形状完整恢复；隔离产物已清理。
- **身份**：identityHash=`632ad5ee…` 不变；生产 MCP 影子保持关闭。

**证据等级：RUNTIME_CUTOVER**。切流完成：生产默认输出规范信封，回退开关可用。下一阶段 B4-S5 观察与关闭。

## B4-S5 观察与批次关闭（2026-08-03）

切片`RF-001-B4-S5`（APPROVED）已执行完成：

- **生产观察**：10个错误路径工具实时探测（task_get/schedule_get/schedule_disable/candidate_get/candidate_decide/run_submit/failure_get/repair_propose/decision_submit/verification_get）全部返回规范信封（category/status/retryable/userActionRequired + errorCode保留）；`run_submit` 额外带出 `safeMessage/correlationRef`——Harness领域错误恢复字段经规范信封完整保留（切流核心价值）；四服务健康。
- **全量回归**：全聚焦43/43、静态校验×3、`git diff --check`、identityHash=`632ad5ee…`、18链18/18。
- **批次关闭**：`batch.yaml` status `IMPLEMENTING → CLOSED`（状态路径：IMPLEMENTING→SHADOW_VERIFIED→CUTOVER_READY→CUTOVER→OBSERVING→CLOSED，终态CLOSED）；`validate_refactoring.py` PASS（CLOSED在状态机内）；cutover-runbook/rollback-runbook 执行与演练记录收口；**RF-002 解禁登记**（决策日志，不启动）。

**RF-001 批次 CLOSED**。33工具名/13别名/8字段信封/条件写与生产行为一致；生产默认规范信封、回退开关可用；切流观察无回归。
