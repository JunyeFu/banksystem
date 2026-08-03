---
id: DOC-ARCH-RF001-FIELD-ERROR-ADAPTER-MATRIX
title: RF-001 MCP-33字段错误与适配器矩阵
document_type: reference
domain: architecture
status: verified
authority: evidence
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# RF-001 MCP-33字段错误与适配器矩阵

## 1. 结论

RF-001-B1完成只读代码考古。本文件记录当前实现，不授权修改运行时代码。

当前合同实际分为三层：

1. `contracts/mcp/hengzhun-i8.json`只冻结工具名、状态和输出等级，不包含输入、输出或错误Schema。
2. `mcp/src/server.cjs`中的Zod定义是Flowise到MCP的实际传输合同，并承担空字符串、JSON字符串、未解析模板和数字文本兼容。
3. `harness/src/i10/schemas.ts`及I8各阶段Schema是业务请求的严格合同；`service.ts`承担领域状态、权限、幂等和稳定错误码。

因此，当前不存在单一机器可读的字段级公共合同。B2必须先冻结三层责任和兼容表，之后才允许实现统一。

## 2. MCP-33请求与端点矩阵

说明：`namespace`、写操作的`idempotencyKey`和固定内部参数由MCP注入，不由Flowise填写。除特别标注外，成功响应为Harness响应的原样受预算输出。

| # | 工具 | Flowise/MCP输入字段 | Harness端点 | 当前特殊行为 |
|---:|---|---|---|---|
| 1 | `credential_session_create` | `label, sessionRef` | `/v1/i10/credentials:sessions-create` | `sessionRef`仅参与幂等键，不进入Harness业务Schema。 |
| 2 | `credential_session_get` | `sessionId` | `/v1/i10/credentials:sessions-get` | 只读。 |
| 3 | `target_profile_prepare` | `displayName, launchUrl, targetProfileId?, credentialRef?, adapterSelection?, adapterBinding?, applicationProfile?, tlsPolicy?, sessionRef` | `/v1/i10/target-profiles:prepare` | `launchUrl/credentialRef`在传输层较宽松，由Harness返回字段级错误；空`targetProfileId`视为缺省。 |
| 4 | `target_profile_get` | `targetProfileId?, launchUrl?` | `/v1/i10/target-profiles:get` | Harness要求二选一。 |
| 5 | `target_profile_decision_submit` | `targetProfileId, expectedVersion, decision, confirmationRef, sessionRef` | `/v1/i10/target-profiles:decide` | `sessionRef`仅参与幂等键。 |
| 6 | `ingest_submit` | `inputType, flowiseFileRef, originalFilename, credentialRef?, targetSystemHint?, entryUrlHint?, supportingImageIngestId?, sessionRef` | `/v1/i10/ingest:submit` | `supportingImageIngestId`为空或`NONE`时删除。 |
| 7 | `ingest_get` | `ingestJobId` | `/v1/i10/ingest:get` | 只读。 |
| 8 | `ingest_decision_submit` | `ingestJobId, expectedVersion, choice, correctionsJson?, itemDecisionsJson?, reason, confirmationRef, sessionRef` | `/v1/i10/ingest:decide` | 两个`*Json`兼容对象、数组或JSON字符串，转为权威数组。 |
| 9 | `image_ingest_submit` | `sourceRef, primaryInputType, images, primaryText?, credentialRef?, sessionRef` | `/v1/i10/images:submit` | 受控附件数组。 |
| 10 | `image_ingest_get` | `imageIngestId` | `/v1/i10/images:get` | 只读。 |
| 11 | `image_ingest_decision_submit` | `imageIngestId, expectedVersion, confirmationRef, decisions, sessionRef` | `/v1/i10/images:decide` | Harness进一步校验`CORRECT/replacementValue`联动。 |
| 12 | `verification_get` | `challengeId?, taskRef?` | `/v1/i10/verification:get` | MCP与Harness均要求二选一，校验重复。 |
| 13 | `verification_decision_submit` | `challengeId, expectedVersion, decision, confirmationRef, note?, sessionRef` | `/v1/i10/verification:decide` | `sessionRef`仅参与幂等键。 |
| 14 | `journey_prepare` | `sessionRef, interactionContractVersion?, journeyId?, requestIntent, inputType, naturalLanguage?, entryUrl?, targetSystem?, flowiseFileRef?, originalFilename?, credentialRef?, targetProfileId?, supportingImages?, scheduleId?, taskId?, draftJson?, semanticAssessment?, inputRevision?` | `/v1/i10/journeys:prepare` | 接受空引用、窄化的未解析模板、图片JSON字符串及数字文本；成功响应经`compactJourneyForFlowise`投影。 |
| 15 | `journey_get` | `journeyId?, sessionRef?, waitSeconds?` | `/v1/i10/journeys:get` | 可受控等待；成功响应经紧凑投影。 |
| 16 | `journey_input_submit` | `journeyId, expectedVersion, inputKind, normalizedInput, submissionRef, sessionRef` | `/v1/i10/journeys:submit-input` | `normalizedInput`兼容对象或JSON字符串。 |
| 17 | `journey_decision_submit` | `journeyId, expectedVersion, decision, confirmationRef, proposalId, payloadHash, payload?, reason?, sessionRef` | `/v1/i10/journeys:decide` | `payload`兼容对象或JSON字符串；引用/Hash由Harness验证。 |
| 18 | `case_prepare` | `caseDescription, draftArray?, draftJson?, acceptanceSummaryJson?, caseTitle?, objective?, summary?, targetSystem?, entryUrl?, preconditions?, actions?, expectedOutcomes?, assertions?, missingFields?, multimodalContextJson?, credentialRef?, journeyId?, sessionRef` | `/v1/i10/cases:prepare`或`/v1/i8/cases:prepare` | 三种草案来源必须且只能一个；兼容I10、旧I8、平铺字段和多模态JSON；按草案形状分流。 |
| 19 | `authoring_submit` | `preparationId, expectedVersion, choice, confirmationRef, reason, caseId?, caseVersion?, route?, executionProfile?, targetProfileId?, targetProfileVersion?, targetProfileHash?, targetProfileSnapshot?, authoringContext?, intentStepIds?, actions?, expectedOutcomes?, riskLevels?, inputValues?, inputValueSources?, assertions?, sessionRef` | `/v1/i8/authoring:submit` | 数字文本强制转整数、空字符串转缺省、上下文JSON解析；最后7组数组字段当前被声明和解构但未进入Harness请求。 |
| 20 | `authoring_get` | `preparationId` | `/v1/i8/authoring:get` | 只读。 |
| 21 | `candidate_get` | `preparationId, sessionRef, waitForCertificate?, waitTimeoutSeconds?, retryFailed?, revisionReason?` | `/v1/i8/candidates:get`, `/authoring:get`, `/candidates:compile`, `/verification:get` | 名为get但可编译、重试、轮询并合并验证门槛，读写责任混合。 |
| 22 | `candidate_preview` | `preparationId, cursor?, limit?, includeDownload?` | `/v1/i8/candidates:get`, `/candidates:preview` | 先解析candidateId；下载地址由MCP补成绝对URL；16KiB预算。 |
| 23 | `candidate_decide` | `preparationId, choice, confirmationRef, reason, sessionRef` | `/v1/i8/candidates:get`, `/candidates:decide` | MCP先读取精确候选版本，再提交决定。 |
| 24 | `run_submit` | `preparationId, sessionRef` | `/v1/i8/runs:submit` | MCP固定注入`credentialAlias=i3-customer`。 |
| 25 | `task_get` | `taskId, waitForTerminal?, waitTimeoutSeconds?` | `/v1/i8/tasks:get`, `/v1/i10/verification:get` | 轮询并将人工验证状态投影为任务状态。 |
| 26 | `schedule_create` | `preparationId, scheduleType, cronExpression?, runAt?, timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef, sessionRef` | `/v1/i8/schedules:create` | MCP固定注入`credentialAlias=i3-customer`。 |
| 27 | `schedule_get` | `scheduleId, action, reason?, sessionRef?` | `/v1/i8/schedules:get`, `/v1/plugin/schedules:disable` | `action=DISABLE`时产生写操作，与独立工具28重叠。 |
| 28 | `schedule_disable` | `scheduleId, reason, sessionRef` | `/v1/i8/schedules:get`, `/v1/plugin/schedules:disable` | 先读版本后乐观并发停用。 |
| 29 | `artifact_download_grant` | `artifactId` | `/v1/i10/artifacts:grant-download` | 只接受制品ID，不接受路径。 |
| 30 | `result_inbox_list` | `cursor?, limit, unreadOnly, acknowledgeInboxIds` | `/v1/i8/results:inbox-list` | 查询时可确认已读，读写责任混合；16KiB预算。 |
| 31 | `failure_get` | `incidentId, waitForProposal?, waitTimeoutSeconds?` | `/v1/i8/failures:get` | 可轮询修复提案；16KiB预算。 |
| 32 | `repair_propose` | `incidentId, patchJson?`或`operationType?, targetRef?, locatorKind?, locatorValue?, rationale?`, `sessionRef` | `/v1/i8/failures:get`, `/v1/i8/repairs:propose` | 兼容结构化Patch和5个平铺字段；先读取并绑定失败信封Hash。 |
| 33 | `decision_submit` | `incidentId, proposalId, choice, confirmationRef, reason, sessionRef` | `/v1/i8/failures:get`, `/v1/i8/repairs:decide` | MCP先读取精确提案版本，再提交决定。 |

## 3. 输出与错误字段现状

### 3.1 成功响应

- Harness没有统一成功信封；各服务直接返回领域对象。
- `journey_prepare/journey_get`由MCP专门压缩，并新增Flowise根级别别名。
- `candidate_get/task_get/failure_get`在MCP中承担轮询和跨端点聚合。
- 默认MCP输出预算为8KiB；部分预览、结果和失败详情使用16KiB。超限只返回`MCP_OUTPUT_BUDGET_EXCEEDED`。
- 当前公开合同没有声明上述输出形状、预算或投影规则。

### 3.2 错误响应

Harness错误原始字段为：

```text
errorCode, category, message, retryable,
userActionRequired, requestId, details
```

MCP上游错误当前只保留：

```text
errorCode, category, status, validationIssues?
```

因此`message/retryable/userActionRequired/requestId/details`通常丢失。MCP本地错误又存在两种额外形状：

- 简单工具错误：`errorCode, category, status`；
- 协议异常：`event, errorCode, errorName, message, category, status`。

当前尚未实现`contract-delta.md`拟定的统一字段：

```text
code, category, retryable, safeMessage, fieldErrors, correlationRef
```

## 4. 兼容适配器盘点

| 适配器 | 当前位置 | 目的 | B1判定 |
|---|---|---|---|
| JSON对象字符串兼容 | MCP `jsonObjectArgument/parseJsonArgument` | 兼容Flowise模板序列化 | 保留，B2登记为入口别名。 |
| JSON数组字符串兼容 | MCP `jsonArrayArgument/parseJsonArrayArgument` | 兼容数组被序列化为文本 | 保留，但须逐字段确认消费者。 |
| 空字符串转缺省 | target/profile、journey、authoring、schedule | 兼容Flowise空状态 | 保留，禁止进入Harness权威对象。 |
| 未解析模板转缺省 | `journey_prepare` | 兼容`{{ output.* }}`残留 | 高风险窄兼容；B2需冻结允许模式。 |
| 数字文本转整数 | journey revision、authoring version | 兼容Flowise数值类型 | 保留，Harness继续严格校验。 |
| 平铺草案转CaseDraft | `case_prepare` | 兼容历史Flowise节点 | 历史别名；不得在B1删除。 |
| I10/I8双路由 | `case_prepare` | 兼容旧I8草案 | 架构债；B2需消费者清单和退场条件。 |
| Journey紧凑投影 | MCP `compactJourneyForFlowise` | 控制输出预算 | 必要，但公共合同未声明。 |
| Journey根别名 | Harness `interactionEnvelope`及MCP投影 | 绕过Flowise嵌套绑定缺陷 | 两层重复；B2需确定唯一生成层。 |
| URL规范化 | MCP case helper、Harness target/journey service | 兼容输入并产生稳定错误 | 存在重复但语义不同；B2不可机械合并。 |
| 读取后写入复合工具 | candidate/schedule/decision工具 | 自动绑定精确版本与Hash | 对用户简化有价值，但工具名与副作用不一致。 |
| 固定凭据别名 | MCP run/schedule | 兼容I8执行合同 | 业务假设泄漏到边界；B2需由权威引用替换或明确冻结。 |

## 5. 已确认缺陷与风险

| 编号 | 严重度 | 发现 | 影响 | B1处理 |
|---|---|---|---|---|
| RF001-F01 | P0 | 公开合同无字段级请求、响应和错误Schema。 | 无法自动验证MCP与Harness漂移。 | B2先冻结版本化字段合同。 |
| RF001-F02 | P0 | Harness错误经MCP丢失恢复、用户动作和关联信息。 | Flowise只能显示泛化错误，难以稳定恢复。 | B2定义统一错误投影，不在B1改码。 |
| RF001-F03 | P0 | `authoring_submit`的7组数组入参未被处理器使用。 | 调用方可能误以为字段生效。 | B2做Flowise消费者审计后决定弃用或接线。 |
| RF001-F04 | P1 | `schedule_get(DISABLE)`与`schedule_disable`重复。 | 两条停用路径增加测试和状态漂移风险。 | B2保留兼容主路径并确定退场路径。 |
| RF001-F05 | P1 | `candidate_get`、`schedule_get`、`result_inbox_list`混合读写或确认副作用。 | 名称不能表达副作用，迁移HiAgent时易误授权。 | B2明确副作用元数据。 |
| RF001-F06 | P1 | Journey根别名在Harness和MCP双重生成。 | 同一语义可能产生两个适配源。 | B2选定唯一别名所有者。 |
| RF001-F07 | P1 | `case_prepare`同时承担三种输入形状和I8/I10分流。 | 兼容逻辑集中、回归面大。 | B2冻结别名映射及退场门槛。 |
| RF001-F08 | P1 | run/schedule由MCP写死`i3-customer`。 | 通用站点与内网迁移存在隐式业务耦合。 | B2确定权威credentialRef到执行别名的映射。 |
| RF001-F09 | P2 | MCP工具版本仍报告`8.0.0`，健康接口报告`10.0.0`，合同为`10.1.0`。 | 运行身份难以从单一版本判断。 | B2统一版本来源设计。 |
| RF004-NEW-001 | 新增 | `I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED`（409）：正式执行（run_submit/schedule_create）无凭据注入且 case 无权威 credentialRef 时失败关闭（DP-S4-2=A，2026-08-03）。 | 凭据绑定权威化 | RF-004 |
| RF001-F04-RETIRED | P1（已关闭） | 2026-08-03 RF-002-S4 G5：`schedule_get(action=DISABLE)` 依据 v7 零消费者证据退场（恢复纯读）；权威停用路径为 `schedule_disable`。退场错误码 `I8_SCHEDULE_DISABLE_CONFIRMATION_REQUIRED` 从 MCP 删除并登记（回滚演练 corpus 保留该文本以保持文档化）。 | — | 边界合同 sideEffect `CONDITIONAL_MUTATION → READ_ONLY`，条件写计数 3→2。 |

## 6. B2入口条件

B2开始前必须完成评审并明确：

1. 33个工具名全部保持，不在RF-001内删除工具。
2. 为每个工具冻结`canonicalRequest / acceptedAliases / canonicalResponse / errorEnvelope / sideEffect`。
3. 历史别名只允许在MCP入口读取；Harness Schema不接收别名。
4. 公开合同必须可以机器校验字段和版本，不再只是工具名清单。
5. 所有删改必须有Flowise消费者搜索、兼容测试、影子比较和回滚映射。
6. B1没有修改MCP、Harness、SQLite、Flowise、Worker或银行运行时代码，ReleaseIdentity必须保持不变。

## 7. 证据来源

- `platform/hengzhun-regression-system/contracts/mcp/hengzhun-i8.json`
- `platform/hengzhun-regression-system/mcp/src/server.cjs`
- `platform/hengzhun-regression-system/harness/src/errors.ts`
- `platform/hengzhun-regression-system/harness/src/server.ts`
- `platform/hengzhun-regression-system/harness/src/i10/schemas.ts`
- `platform/hengzhun-regression-system/harness/src/i10/service.ts`
- `platform/hengzhun-regression-system/harness/src/i8/stage2-schemas.ts`
- `platform/hengzhun-regression-system/harness/src/i8/stage3-schemas.ts`
- `platform/hengzhun-regression-system/harness/src/i8/stage5-schemas.ts`
- `platform/hengzhun-regression-system/harness/src/i8/stage6-schemas.ts`
- `platform/hengzhun-regression-system/harness/src/i8/stage7-schemas.ts`
