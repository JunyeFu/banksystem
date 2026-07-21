---
id: DOC-DESIGN-HENGZHUN-I8-DETERMINISTIC-AUTHORING-V1
title: 衡准 I8 确定性脚本作者化阶段实施规格 V1
document_type: implementation-specification
domain: regression-platform
status: accepted
authority: normative
version: 1.5
effective_date: 2026-07-20
owner: project-owner
---

# 衡准 I8 确定性脚本作者化阶段实施规格 V1

> 本文是 [`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md) 中 I8 的冻结详细规格，只回答 I8 如何编码、测试和验收。它不定义其他阶段、不维护任务状态、不改变 I0—I7 历史事实，也不构成第二份实施顺序。任务状态仍只由 `agent/backlog.yaml` 维护。

## 1. 冻结目标

I8 将用户的一句自然语言案例描述转换为可审计、可重复生成、经纯 Playwright 稳定性验证的脚本包，并在用户明确选择后保存、激活或调度。

首个唯一验收案例固定为：

> 客户在复兴银行门户输入账号密码登录后，右上角姓名和头像与个人资料页一致。

I8 完成时必须同时具备：

1. 自然语言输入不包含技术提示或工具参数；
2. 知识、案例、意图、执行计划、动作事实、DSL、脚本、验证和人工决定全链可追踪；
3. Midscene 只提供视觉理解和候选定位，Playwright 重放动作并判定事实；
4. Playwright 脚本由确定性 Builder 生成，不执行模型任意源码；
5. 候选脚本通过 6 次独立纯 Playwright 执行后取得稳定性证书；
6. 用户能查看受控脚本预览和真实验证结论，并选择保存、激活、按需、周期或一次性执行；
7. 失败通过分级上下文和受限补丁形成新候选，任何修复都重新走完整稳定性门禁；
8. 个人/办公电脑使用 Windows 原生 Flowise 3.0.12，平台外调用只经过 MCP；HiAgent 没有等价证据的 Flowise 能力使用数量为零。

## 2. 明确非目标

I8 不实现以下内容：

- 视频案例导入（已确认的产品扩展需求，延期到 I8 确定性闭环完成后，不得解释为永久取消）；
- Playwright、Selenium、Cypress、Postman、Gherkin 等外部案例导入（同为延期需求）；
- 任意 JavaScript/TypeScript 代码生成或执行；
- 自动修改复兴银行、Harness、Worker、Flowise、HiAgent 或项目仓库源码；
- 自动弱化业务断言；
- 自动激活脚本或自动迁移调度；
- 衡准图形化观测界面；
- 转账、贷款、日终、审批等高风险银行案例；
- 将 Flowise 本机证据写成 HiAgent 已验证证据。

## 3. 固定运行边界

```text
用户自然语言
→ Flowise Agentflow V2（个人/办公电脑）
→ 已注册 MCP Client
→ 衡准 MCP Server
→ Harness / regression_platform.sqlite
→ Midscene 候选定位
→ Playwright 动作重放与事实验证
→ Script Package Builder
→ Playwright Stability Runner
→ Harness 证据与状态
→ MCP
→ Flowise 对话结果与人工选择
```

测试环境迁移时只把 Flowise Agentflow 替换为等价 HiAgent Workflow；MCP、Harness、SQLite、Builder、Worker、Playwright 和 Midscene 的契约不变。Flowise 与 HiAgent 的平台资源 ID、会话、内部数据库和凭据不进入通用制品。

### 3.1 Agent 平台与本地工具职责

Flowise 只执行：自然语言接收、平台知识查询、案例结构化、最小澄清、验收摘要、`IntentPlan` 候选、已注册 MCP 工具编排、Human Input、结果解释和调度自然语言规范化。

本地工具集只执行：服务鉴权、Schema/幂等/namespace、SQLite 权威状态、可执行计划编译、租约、Fixture、Midscene 视觉候选、Playwright 事实验证、DSL 脚本生成、稳定性证书、正式运行、调度、事故、证据和审计。

完整分配表以 [`Flowise、SQLite 与 HiAgent 架构基线`](../../architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md) 为准。任何操作必须且只能归属其中一侧；禁止用 Flowise 代码节点、内部 API 或内部 SQLite 绕过 MCP。

### 3.2 双知识库与双 SQLite 边界

I8 使用两个知识库和两个物理隔离的 SQLite 文件。仓库 `rag/` 只用于开发，产品目录不包含自研 RAG、Embedding、Vector Store、Retriever 或知识同步子系统：

| 存储 | 职责 | 是否权威 |
|---|---|---|
| Flowise 平台知识库 | 通过 Flowise 公开知识入口保存业务规则、页面语义、术语、测试原则、风险和结果解释；内部检索实现不进入衡准架构 | 对已发布业务语义版本权威，不对运行状态权威 |
| Flowise `database.sqlite` | Agentflow、节点配置、会话、Human Input 检查点和平台知识元数据 | 只对 Flowise 平台状态权威 |
| Harness `regression_platform.sqlite` | 案例、知识快照引用、计划、动作事实、定位器、DSL、脚本、证书、运行、调度、事故、决定和证据元数据 | 衡准回归领域唯一事实源 |

Flowise 保存知识正文，Harness 只保存 `knowledgeSnapshotId / sourceVersion / contentHash / citationIds`。Harness 保存运行事实，Flowise 只通过 MCP 读取脱敏摘要。两边禁止正文、状态或决定双写；LLM 不得直接查询任一 SQLite。Flowise 平台内部使用何种检索机制不改变该边界，也不得要求产品新增 `rag/` 目录。

## 4. 用户交互契约

### 4.1 唯一必填输入

```json
{
  "caseDescription": "客户在门户输入账号密码登录后，右上角姓名和头像与个人资料页一致"
}
```

`requestId`、`namespace`、`idempotencyKey`、`credentialAlias`、风险、Fixture、路由、工具参数和重试次数全部由 Workflow/Harness 生成或从受控配置注入，不向普通用户索取。

### 4.2 最小澄清

只有以下三种情况允许向用户提问：

1. 目标角色不明确且会改变可见数据；
2. 期望结果存在两个互斥业务含义；
3. 案例包含 HIGH 风险动作或不可逆副作用。

首个验收案例使用已冻结的客户角色、合成 Fixture 和无资金副作用路线，不产生澄清问题。

### 4.3 验收摘要

作者化前固定返回 `AcceptanceSummary`：

- 目标：账号密码登录后身份展示一致；
- 前置：客户 Fixture 已准备、账号启用、角色为 `CUSTOMER`、客户映射唯一；
- 关键动作：打开门户、填写用户名与密码、提交、读取页眉、打开个人资料；
- 断言：登录成功、姓名一致、头像身份标记一致、当前用户资料属于登录主体；
- 证据：脱敏报告、遮罩截图、步骤日志、脚本 Hash、稳定性证书；
- 风险：LOW，不执行资金写操作；
- 数据处理：每次验证创建独立 Fixture，结束后按 Fixture 策略清理。

## 5. 冻结领域对象

所有对象使用 UTF-8 JSON、严格 Schema、未知字段拒绝、ISO 8601 UTC 时间和不透明 ID。所有版本从 1 开始且只增不减。

### 5.1 KnowledgeSnapshotRef

| 字段 | 类型 | 规则 |
|---|---|---|
| `knowledgeSnapshotId` | string | Harness 生成，不透明 ID |
| `platform` | enum | `FLOWISE` 或 `HIAGENT` |
| `collectionRef` | string | 脱敏逻辑引用，不保存平台密钥 |
| `version` | integer | 大于 0 |
| `contentHash` | string | SHA-256 小写十六进制 |
| `citationIds` | string[] | 至少 1 项，去重且排序 |
| `capturedAt` | string | UTC 时间 |

没有有效 `KnowledgeSnapshotRef` 时不得生成可执行计划。

### 5.2 RegressionCaseDraft

固定字段：`caseId`、`caseVersion`、`caseDescription`、`goal`、`actorRole`、`preconditions[]`、`stepIntents[]`、`businessAssertions[]`、`evidenceRequirements[]`、`riskLevel`、`fixtureProfile`、`knowledgeSnapshotRef`、`createdAt`。

首个案例固定 `actorRole=CUSTOMER`、`riskLevel=LOW`、`fixtureProfile=LOGIN_PROFILE`。

### 5.3 IntentPlan

`IntentPlan` 只表达业务意图，不包含 CSS/XPath、Playwright API、绝对 URL、账号密码或源代码。固定字段：

- `intentPlanId / version / caseId / caseVersion`；
- `entryIntent`；
- `preconditionChecks[]`；
- `businessSteps[]`；
- `branches[]`；
- `failureExits[]`；
- `dataLifecycle.prepare / cleanup`；
- `assertionIntents[]`；
- `knowledgeSnapshotId / contentHash`；
- `intentHash / createdAt`。

### 5.4 ExecutableActionPlan

Harness 根据 `IntentPlan` 和受控探索事实编译 `ExecutableActionPlan`。每个动作固定包含：

- `actionId / ordinal / operation`；
- `pageSignature`：路由模式、标题/地标、必需 ARIA 元素；
- `semanticTarget`：角色、可访问名称或 `data-testid` 逻辑引用；
- `allowedLocatorKinds`：仅 `ROLE`、`LABEL`、`TEST_ID`；
- `riskLevel`；
- `fixtureRefs[]`；
- `preconditions[] / invariants[] / postconditions[]`；
- `retryPolicy`：只允许 0 或 1 次无副作用重试；
- `branchRules[] / failureExit`；
- `evidencePolicy`；
- `sourceIntentStepId`。

禁止 CSS、XPath、坐标点击、任意 JS、固定 sleep 和秘密明文进入计划。

### 5.5 ActionContextEnvelope

上下文分三级，命名为 `CTX-L1 / CTX-L2 / CTX-L3`，Harness 默认只发 `CTX-L1`，不得与 `OUT-L0...OUT-L3` 工具输出预算混用：

| 级别 | 固定内容 | 使用条件 |
|---|---|---|
| `CTX-L1` | 当前动作、页面签名、不变量、风险、允许目标、Fixture 引用、最近事实观察、租约 | 每个动作默认 |
| `CTX-L2` | `CTX-L1` + 上一动作脱敏结果 + 下一动作最小预览 | 当前动作无法独立消歧 |
| `CTX-L3` | `CTX-L2` + 当前分支的最小依赖锥 | 分支或修复经规则判定确有需要 |

不得发送完整案例库、完整计划、完整对话、SQLite 内容、凭据或其他案例证据。

每个 Envelope 必须包含以下预算字段：

- `consumerType: VISION_LLM | CONTROLLER_LLM`；
- `contextLevel: CTX-L1 | CTX-L2 | CTX-L3`；
- `modelContextLimitTokens`、`inputBudgetTokens`、`reservedOutputTokens`；
- `estimatedInputTokens`、`imageTokenEstimate`、`tokenizerId`；
- `budgetDecision: ALLOW | REDUCE | SPLIT | PLAYWRIGHT_ONLY | WAITING_USER`；
- `redactionProfileId`。

视觉 LLM 固定 `modelContextLimitTokens=16000`、`inputBudgetTokens=12000`、`reservedOutputTokens=4000`。主控 LLM 固定 `modelContextLimitTokens=1000000`、`inputBudgetTokens=967232`、`reservedOutputTokens=32768`。完整窗口包含提示、工具 Schema、消息、截图/图像 token 和输出。容量不授权扩大读取范围。

视觉包超过 12,000 输入 token 时按固定顺序处理：去除重复描述 → 使用更小截图/ROI → 只保留 Playwright 已验证事实 → 拆分当前动作 → 退化纯 Playwright/等待人工。禁止删除当前动作、不变量、风险、允许目标、租约或断言；仍超限返回 `VISION_CONTEXT_BUDGET_EXCEEDED`。主控超限时使用结构化摘要、分页或 Workflow 拆分，仍超限返回 `CONTROLLER_CONTEXT_BUDGET_EXCEEDED`。

#### 5.5.1 I8 开工基线与不可复用假设

2026-07-20 审计确认：历史 I4 Harness 已能从 SQLite 发放上一动作摘要、当前动作、下一动作预览、最近观察和页面状态，并以单动作租约控制游标；但历史 Midscene Worker 只消费 `currentAction.prompt`。因此只能复用持久化、游标、租约和 Playwright 推进机制，不能把现有返回对象直接认定为本节的 `ActionContextEnvelope`。

I8 第一步必须在任何 Flowise Agentflow 接入前完成：

1. 以 `additionalProperties: false` 冻结视觉与主控 Envelope、预算决定和确定性错误 Schema；
2. migration 009 持久化上下文级别、消费者、预估/最终 usage、图像估算、tokenizer、预算决定和脱敏配置引用，禁止保存秘密正文；
3. Harness 默认构造 `CTX-L1`，只有确定性“不足”结果才能升级 L2/L3，并记录原因；
4. Worker 必须消费完整受控 Envelope，不得自行从完整计划、SQLite 或对话历史补上下文；
5. 视觉请求发送前和主控请求发送前分别执行预算门禁，模型返回后记录提供方实际 usage；
6. 增加测试证明模型适配器收到的字段集合、超限降级、禁止字段缺失、租约一致性和审计写回。

历史 `test:i4` 只作为机械层回归测试；它不能替代真实 MiMo 上下文消费测试、Flowise 主控交接测试或 token 预算测试。

#### 5.5.2 阶段1实现记录

2026-07-20 阶段1已完成以下代码落点：

- `harness/src/context-envelope.ts`：严格 Envelope、模型 usage、16K/1M 策略、保守文本/图像估算、错误码和 Midscene 提示构造；
- `harness/migrations/009_i8_context_budget.sql`：动作 CTX、Envelope Hash 和不可变预算审计；
- `harness/src/service.ts`：Claim 构造/Hash/审计，歧义时 L1→L2→L3，完成时校验租约/审计/Hash并写回usage；
- `runtime/midscene-authoring-worker.cjs`：只消费严格 Envelope，模型路径传完整受控上下文，Playwright-only 明确不调用模型；
- Worker OpenAPI 1.3.0：冻结 Claim、Envelope、Completion和usage；
- `tests/i8/context-envelope.test.cjs`：阶段1九项自动测试，与I2—I6历史测试共同回归。

阶段1状态为 `IMPLEMENTED_AND_AUTOMATED_TESTED`。真实 MiMo 调用、Flowise Agentflow/MCP 交接和主控实际usage属于后续阶段；当前不得用自动测试替代其实机证据。

#### 5.5.3 阶段2实现记录

2026-07-20 阶段2已完成以下落点：

- `flowise/i8/agentflow-v2.json`：Flowise 3.0.12 Agentflow V2 同源制品，普通用户唯一输入为案例描述；
- `flowise/i8/knowledge/`、`deployment-manifest.json`、`hiagent-capability-map.yaml`：知识来源/Hash、部署变量和逐节点 HiAgent 等价映射；
- `mcp/src/server.cjs` 与 `contracts/mcp/hengzhun-i8.json`：Bearer Streamable HTTP、14工具白名单、固定本机 Harness、技术参数注入、输出预算和后续工具失败关闭；
- `harness/migrations/010_i8_agentflow_handoff.sql`、`harness/src/i8/stage2-schemas.ts`：案例准备、知识快照引用、验收摘要、人工确认、IntentPlan Hash 与 `AWAITING_STAGE3` 权威状态；
- `tests/i8/stage2-agentflow-mcp.test.cjs`：migration、Schema、状态机、Flowise节点兼容、禁止节点、认证、14工具以及真实 Flowise MCP Client→Harness→SQLite 集成。

阶段2状态为 `IMPLEMENTED_AND_LOCAL_INTEGRATION_VERIFIED`。`verify:i8:stage2` 当前11/11。当前进程未注入MiMo密钥且未把Agentflow发布到运行中的Flowise，所以不得声明真实主控模型对话已验收；HiAgent映射制品也不证明目标环境注册、网络或运行成功。

#### 5.5.4 阶段3确定性Builder实现记录

2026-07-20 阶段3状态为 `IMPLEMENTED_AND_LOCAL_INTEGRATION_VERIFIED`，从阶段2的`AWAITING_STAGE3`获批IntentPlan开始，已完成：

- migration 011新增执行计划、候选构建任务、Playwright动作事实和脚本候选表，以触发器保护来源/Hash不可变并禁止删除；
- 严格`ExecutableActionPlan`、`VerifiedActionRecord`和`HENGZHUN_DSL_V1` Schema，只允许本文7.1的10种操作与`ROLE/LABEL/TEST_ID`三种定位器；
- 固定模板`Script Package Builder`，记录case/plan/DSL/generator/source-chain Hash，相同规范化输入生成字节一致脚本；
- 候选文件只写入`.data/candidates/<namespace>/candidate_<id>`，SQLite只保存受控相对引用和Hash；
- Worker执行前复核manifest与脚本Hash，拒绝目录逃逸、动态模块、`eval/Function`、文件/进程/命令能力和任意运行时安装；
- MCP第4项活跃工具`candidate_get`只接收业务准备引用；MCP先读取`authoring_get`并注入当前受控版本，普通用户、Flowise和主控LLM均不提供技术并发参数。

`verify:i8:stage3` 当前15/15。该验证以受控Fake Page证明Playwright调用契约和篡改拒绝，不证明真实Chromium稳定性。候选保持`GENERATED`，下一动作固定为`I8_STAGE4_STABILITY_REQUIRED`；阶段3不得生成`StabilityCertificate`、激活或调度候选。真实Agentflow/MiMo/HiAgent边界与阶段2相同，仍未验收。

#### 5.5.5 阶段4稳定性证书实现记录

2026-07-20 阶段4状态为 `IMPLEMENTED_AND_REAL_PORTAL_VERIFIED`：

- migration 012新增不可变稳定性批次、固定六个验证样本和证书表，终态与证书禁止修改或删除；
- 视口冻结为1440×900与390×844，各按序执行3次；六个样本使用独立Fixture，每次创建全新BrowserContext并验证初始storage state为空；
- Worker执行前复核候选脚本、manifest和运行时指纹，执行后生成脱敏报告、有效PNG截图与步骤日志，并由Harness复核相对路径、长度和SHA-256；
- 只有六次全部通过且候选Hash、运行时指纹、断言集Hash、证据形状Hash一致时才签发不可变`StabilityCertificate`；任何失败均整批`VALIDATION_FAILED`，不创建替代样本、不重试、不签证；
- 常驻Worker已轮询阶段4Claim并回传Completion；专项测试使用内置Chromium对合成门户验证成功/失败分支，实机门禁使用同一内置Chromium对真实复兴银行门户完成6/6；
- 真实门户异步加载曾暴露瞬时可见性误判，生成模板现使用冻结30秒上限的`waitFor visible`，错误码只携带非敏感语义目标。

阶段4没有实现脚本预览、下载、`SAVE_ONLY / ACTIVATE`、定时或修复；候选的下一动作固定进入阶段5。真实Flowise Agentflow发布、MiMo主控对话和HiAgent运行仍未验收。

## 6. Midscene 与 Playwright 执行协议

1. Midscene 在作者化 BrowserContext 中读取当前 `ActionContextEnvelope` 和截图，输出 `VisualCandidate`。
2. `VisualCandidate` 只包含语义目标、候选定位器种类、可访问名称、置信信息、歧义原因和页面观察；不得包含可执行源码。
3. Midscene 的 `aiInput/aiTap/aiScroll` 只用于作者化探索，不产生事实通过结论。
4. Playwright 在受控状态中按 `ExecutableActionPlan + VisualCandidate` 重放动作。
5. Playwright 验证目标唯一性、DOM/ARIA、URL、请求/响应和业务断言后写入 `VerifiedActionRecord`。
6. 任一必需事实失败，Harness 不推进游标；Midscene 自报成功不能覆盖 Playwright 失败。
7. 正式回归和调度执行只运行 `SCRIPT_VALIDATED` Playwright 包，不调用 Midscene 或主控 LLM。

## 7. 有限 DSL 与脚本生成

### 7.1 DSL 操作全集

I8 V1 只允许以下 10 个操作，未列出的操作一律拒绝：

| 操作 | 用途 | 必需参数 |
|---|---|---|
| `goto` | 打开允许的产品路由 | `routeRef` |
| `fill` | 填写受控输入 | `targetRef`, `fixtureValueRef` |
| `click` | 点击低风险目标 | `targetRef` |
| `select` | 选择固定候选项 | `targetRef`, `optionRef` |
| `waitForURL` | 等待路由终态 | `routePatternRef`, `timeoutPolicyRef` |
| `waitForResponse` | 等待受控接口 | `operationId`, `statusSet` |
| `expectVisible` | 可见性断言 | `targetRef` |
| `expectText` | 文本断言 | `targetRef`, `expectedValueRef` |
| `expectEqual` | 两个已提取值相等 | `leftRef`, `rightRef` |
| `screenshot` | 生成遮罩截图 | `evidenceName`, `maskRefs[]` |

### 7.2 生成方式

- Builder 输入：版本化案例、`IntentPlan`、`ExecutableActionPlan`、全部 `VerifiedActionRecord`、DSL 文档、Fixture 引用和断言契约。
- Builder 输出：Node 20 CommonJS `.cjs` Playwright 脚本包。
- Builder 使用固定模板和串行化器，不使用 LLM 生成源码，不使用 `eval`、`Function`、动态 import 或运行时安装。
- 生成包写入 `.data/candidates/<namespace>/<candidateId>/`；不覆盖 `worker/src/` 预置脚本，不进入 Git。
- 包清单固定包含 `candidateId`、`scriptId`、`scriptVersion`、`caseId`、`caseVersion`、`intentPlanId`、`executablePlanId`、`dslVersion=HENGZHUN_DSL_V1`、`generatorVersion`、文件 Hash、依赖白名单和生成时间。
- 相同规范化输入必须生成字节一致的脚本与相同 Hash。

### 7.3 定位器规则

生成脚本只允许 `getByRole`、`getByLabel`、`getByTestId`。优先级固定为 `ROLE → LABEL → TEST_ID`；每个目标必须唯一。禁止 CSS、XPath、坐标、文本模糊包含和 `nth()` 绕过歧义。

## 8. SQLite migration 009

新增迁移文件固定为 `harness/migrations/009_i8_deterministic_authoring.sql`。它新增以下表，不修改历史迁移：

| 表 | 用途 | 关键约束 |
|---|---|---|
| `knowledge_snapshots` | 知识快照引用 | `namespace + content_hash` 唯一 |
| `intent_plans` | 业务意图版本 | `case_id + version` 唯一，Hash 必填 |
| `executable_action_plans` | 可执行计划版本 | 关联 intent plan，状态受 CHECK 约束 |
| `verified_action_records` | Playwright 动作事实 | `plan_id + action_id + attempt` 唯一 |
| `script_candidates` | 生成候选 | `script_id + candidate_version` 唯一，Hash 必填 |
| `stability_validation_runs` | 六次验证明细 | 关联 candidate、viewport、fixture scope |
| `stability_certificates` | 稳定性证书 | 每个 candidate 最多一张，通过数固定 6 |
| `script_delivery_decisions` | 保存/激活决定 | 追加写，禁止 UPDATE/DELETE |
| `step_failure_envelopes` | 分级失败消息 | 保存脱敏 JSON 与上下文级别 |
| `result_inbox_items` | 离线结果收件箱 | `namespace + run_id` 唯一，可确认已读 |

`schedules` 增加 `schedule_type`、`run_at`、`case_version`、`plan_id`、`script_version`；`schedule_type` 只允许 `RECURRING`、`ONE_TIME`。历史周期调度迁移为 `RECURRING` 并绑定创建时实际脚本版本；无法确定版本的调度迁移后状态为 `DISABLED`，不得静默跟随最新脚本。

所有新增决定表和证书表使用不可变触发器；迁移前自动备份，迁移后执行 `foreign_key_check` 和 `integrity_check`。

## 9. MCP 工具面

I8 对 Agent 平台公开且只公开以下 MCP 业务工具：

1. `case_prepare`：自然语言草案、知识引用和验收摘要入库；
2. `authoring_submit`：提交已确认案例进入意图/执行计划编译；
3. `authoring_get`：查询作者化状态和最小进度；
4. `candidate_get`：查询候选、Hash 和稳定性状态；
5. `candidate_preview`：按行游标返回只读脚本预览；
6. `candidate_decide`：提交 `SAVE_ONLY`、`ACTIVATE` 或 `REJECT`；
7. `run_submit`：只运行 `SCRIPT_VALIDATED` 精确版本；
8. `task_get`：查询任务终态；
9. `schedule_create`：创建 `RECURRING` 或 `ONE_TIME` 精确版本调度；
10. `schedule_get`：查询调度与最近执行；
11. `result_inbox_list`：分页读取未送达/历史结果摘要；
12. `failure_get`：读取事故和分级失败消息；
13. `repair_propose`：提交受限 `ScriptPatchProposal`；
14. `decision_submit`：提交恢复、修复或调度迁移人工决定。

所有工具使用现有服务身份、namespace、幂等、allowlist、审计和 `OUT-L0...OUT-L3` 输出预算：`OUT-L0` 状态默认/上限 `4/8 KiB`，`OUT-L1` 回执 `8/16 KiB`，`OUT-L2` 详情 `32/64 KiB`，`OUT-L3` 元数据 `64/128 KiB`；Harness 绝对上限 `128 KiB`。`candidate_preview` 使用 `OUT-L1`，单响应上限 16 KiB，按完整行分页；返回 `candidateId`、`scriptHash`、`startLine`、`endLine`、`lines[]`、`nextCursor`，禁止返回路径、凭据或 Storage State。超限时只能分页或转 Artifact 引用，不能安全降级则返回 `OUTPUT_BUDGET_EXCEEDED`。MCP 不公开任意文件、SQL、Shell、浏览器脚本或 URL 工具。

## 10. 稳定性证书

`StabilityCertificate` 的取得条件固定且不可配置：

- 视口 A：`1440 × 900`；
- 视口 B：`390 × 844`；
- 每个视口连续执行 3 次，共 6 次；
- 每次使用全新 BrowserContext、空 Storage State、独立 Fixture namespace；
- 每次运行前确认不存在残留登录态；
- 六次业务断言集合完全一致且全部通过；
- 六次均生成脱敏报告、遮罩截图和步骤日志；
- 候选脚本 Hash、案例版本、计划版本、运行时版本在六次中一致；
- 不允许用重试替换失败样本；任一次失败即整张证书失败，修复后以新候选版本重新执行 6 次。

证书固定字段：`certificateId`、`candidateId`、`scriptHash`、`caseVersion`、`executablePlanVersion`、`runtimeFingerprint`、`viewportSet`、`validationRunIds[6]`、`assertionSetHash`、`evidenceSetHash`、`status`、`issuedAt`。

## 11. 人工交付与调度

### 11.1 候选决定

- `SAVE_ONLY`：保留候选和证书，不进入正式执行；
- `ACTIVATE`：原子激活精确 `scriptVersion`，旧版本保留；
- `REJECT`：保留审计记录，候选不可再激活。

没有 `StabilityCertificate=PASSED` 时，`ACTIVATE` 必须返回冲突错误。激活不自动执行、不自动创建调度。

### 11.2 调度输入

用户只表达“每周一上午九点执行”或“2026-07-25 14:00 执行一次”。Workflow 生成规范化配置并回显：类型、北京时间、IANA 时区 `Asia/Shanghai`、Cron 或 `runAt`、Fixture、misfire、宽限时间、重试次数和精确脚本版本。用户确认后调用一次幂等 `schedule_create`。

`RECURRING` 使用五字段 Cron；`ONE_TIME` 使用带时区 `runAt`，成功或最终失败后自动终止。两者都绑定 `caseVersion + planId + scriptId + scriptVersion`。脚本升级时旧调度不自动迁移。

### 11.3 结果收件箱

每个正式/调度 Run 终态都写入 `result_inbox_items`。在线 Workflow 可轮询并返回；用户离线时，下次会话先调用 `result_inbox_list`，按时间倒序返回状态、断言摘要和脱敏 Artifact 元数据。Agent 会话中断不得丢失结果。

## 12. 正向状态机

```text
DRAFT
→ KNOWLEDGE_PINNED
→ ACCEPTANCE_READY
→ INTENT_PLANNED
→ EXECUTABLE_PLAN_READY
→ AUTHORING
→ ACTIONS_VERIFIED
→ CANDIDATE_GENERATED
→ STABILITY_VALIDATING
→ STABILITY_CERTIFIED
→ WAITING_USER
→ SAVED | SCRIPT_VALIDATED | REJECTED
→ ON_DEMAND_RUN | SCHEDULED
```

任一非法跳转返回 409。状态只能由 Harness 事务推进，Workflow 对话文本、Midscene 输出和 LLM 判断均不能直接改状态。

## 13. 反向修复状态机

正式回归失败后固定执行：

```text
FAILED
→ INCIDENT_RECORDED
→ FAILURE_CLASSIFIED
→ StepFailureEnvelope(CTX-L1)
→ REPORT_ONLY | RETRY_ALLOWED | REAUTHOR_REQUIRED | PATCH_ALLOWED
→ 必要时升级 CTX-L2/CTX-L3
→ NEW_CANDIDATE
→ 6 次 Stability Validation
→ WAITING_USER
→ ACTIVATE 或 REJECT
→ 用户另行决定复跑和调度迁移
```

事故分类全集固定为：`ENVIRONMENT`、`AUTHENTICATION`、`CONTRACT`、`LOCATOR`、`ASSERTION`、`MODEL`、`TOOL`、`FIXTURE_DATA`、`PRODUCT_DEFECT`、`FLAKY_TIMING`、`SCRIPT_LOGIC`。

`ScriptPatchProposal` 只允许修改 `targetRef` 映射、事件等待条件、受控动作参数、步骤顺序和不削弱契约的断言实现。每阶段最多 3 个候选；耗尽后进入 `UNRESOLVED`。禁止模型提交完整源码、修改项目代码、减少断言或绕过认证。

## 14. 代码落点

新增代码固定落在：

```text
platform/hengzhun-regression-system/
├── flowise/i8/                      Agentflow 同源定义、知识制品与 HiAgent 映射
├── mcp/src/                         MCP Server 与 14 个业务工具适配
├── contracts/schemas/i8/            冻结 JSON Schema
├── contracts/mcp/hengzhun-i8.json   MCP 工具契约
├── harness/migrations/009_i8_deterministic_authoring.sql
├── harness/src/i8/                   计划、Builder、证书、收件箱服务
├── worker/src/i8/                    候选执行与稳定性 Runner
├── tests/i8/                         单元、迁移、契约、集成和 E2E
└── scripts/verify-i8.ps1             I8 唯一专项验证入口
```

现有 `worker/src/login-profile.cjs` 等预置脚本只作为回归对照，不得被复制后冒充 Builder 新生成脚本。

## 15. 测试矩阵

| 层级 | 必测内容 |
|---|---|
| Schema | 正常、缺字段、未知字段、越界、秘密/路径/代码注入拒绝 |
| Migration | 8→9、备份、历史调度绑定、未知版本禁用、回滚保护、完整性 |
| Builder | 10 操作白名单、确定性输出、Hash、一致输入字节一致、禁用能力拒绝 |
| MCP | 14 工具 Schema、鉴权、namespace、幂等、输出预算、无任意能力 |
| Authoring | `CTX-L1/CTX-L2/CTX-L3` 最小上下文、视觉 16K/12K 输入门禁、主控 1M 门禁、租约、Midscene 歧义、Playwright 独立验证；断言 Worker/模型适配器实际收到完整 Envelope 而非仅 `currentAction.prompt` |
| Stability | 6 次通过发证、任一次失败不发证、Fixture/Context 隔离、证据一致 |
| Delivery | 预览分页、Hash、SAVE_ONLY/ACTIVATE/REJECT、并发版本冲突 |
| Scheduling | 精确版本绑定、自然语言规范化、周期、一次性、misfire、离线收件箱 |
| Repair | 十一类事故、上下文升级、3 次上限、补丁白名单、重新发证 |
| E2E | 首个登录/资料一致性案例从一句自然语言到脚本预览和人工激活 |

## 16. 验证命令

I8 实现完成后统一执行：

```powershell
cd D:\Agent\banksystem\platform\hengzhun-regression-system
npm.cmd run build
npm.cmd run test:i8
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-i8.ps1
npm.cmd run verify
cd D:\Agent\banksystem
python scripts\docs\validate_docs.py
git diff --check
```

`package.json` 必须新增 `test:i8` 和 `verify:i8`，根 `verify.cmd` 必须纳入 I8。真实浏览器 E2E 无法运行时不得关闭 I8，只能记录 `BLOCKED/NOT_RUN` 和具体环境原因。

## 17. 退出证据

I8 退出证据必须包含且只包含：

- Schema 与 MCP 契约版本/Hash；
- migration 009、SQLite schema version 和完整性结果；
- Builder 版本、DSL 版本、候选脚本 Hash 与来源链；
- 6 个稳定性 Run ID、2 个视口、6 个独立 Fixture 引用和证书 ID；
- 脱敏报告、遮罩截图、步骤日志的 Artifact 元数据与 Hash；
- 脚本预览分页、人工决定、精确版本激活与并发冲突测试；
- 周期/一次性调度和离线结果恢复证据；
- 十一类事故与限域修复测试结果；
- Flowise 使用能力到 HiAgent 证据映射清单；
- `verify:i8`、全量 `verify`、文档校验和 `git diff --check` 结果。

证据不得包含账号密码、Token、Cookie、Storage State、绝对本机路径、未脱敏截图、完整敏感日志或 Flowise/HiAgent 内部数据库。

## 18. 残余风险

I8 方案本身已冻结；以下是外部验收风险，不改变实现选择：

- HiAgent 目标环境的 MCP 注册、网络和容量仍需在目标服务器重新验证；
- Flowise/HiAgent 平台版本变化可能使映射证据失效，失效时对应 Workflow 能力必须失败关闭；
- MiMo/Midscene 模型波动会使作者化失败，但不会影响已激活 Playwright 脚本的正式回归；
- 被测门户或接口契约变化会产生事故，不允许通过弱化断言掩盖。

这些风险只决定运行状态和是否能关闭目标环境门禁，不授权改变本规格中的安全、确定性和人工确认规则。

## 19. 阶段5实现记录（2026-07-20）

- migration 013新增`i8_script_delivery_decisions`和`i8_script_download_grants`；决策不可更新/删除，下载授权只允许`ACTIVE→USED/EXPIRED`。
- `candidate_preview`只读取有效持证且双Hash复核通过的候选，按完整行分页，单次MCP输出最大16KiB；可选下载授权5分钟有效、一次使用、数据库只保存Token Hash。
- `candidate_decide`冻结`SAVE_ONLY / ACTIVATE / REJECT`。ACTIVATE原子建立精确脚本版本和READY计划，保留历史版本，但不创建Run、Task、Schedule。
- `run_submit`只接受已ACTIVATE的精确候选；任务只携带受控候选ID、相对目录、script/manifest Hash与凭据别名。常驻Worker通过`i8-formal-runner.cjs`执行纯Playwright，不调用Midscene或LLM。
- `task_get`只返回最小任务、Run结果和错误元数据。Flowise阶段5续办制品由控制器状态注入`preparationId`，用户不输入技术ID；仍需真实平台导入/发布验证。
- `verify:i8:stage5`累计25/25；`verify:i8:stage5:live`在真实复兴银行门户完成6次签证、预览、精确激活及正式复跑。此证据不包含阶段6调度/收件箱，也不证明真实MiMo、Flowise发布或HiAgent运行。

## 20. 阶段6实现记录（2026-07-20）

- migration 014为`schedules`增加`schedule_type/run_at/script_id/script_version/script_sha256/one_time_state/completed_at`。历史调度按当时计划的实际脚本版本回填；身份不完整即`DISABLED`。
- `RECURRING`继续使用五字段Cron与IANA时区；`ONE_TIME`只接受带偏移且未来的`runAt`。一次性执行进入`RUNNING`后不重复投递，成功或最终失败自动`DISABLED`并保留终态。
- 调度执行通过冻结的`scriptId + scriptVersion + scriptHash`读取`script_versions`，Hash冲突失败关闭；`scripts.current_version`后续变化不会迁移旧调度。
- `result_inbox_items`以`namespace + run_id`唯一。每个按需/调度正式Run仅在最终终态写入一次，重试中不提前投递；记录不可删除，身份与结果不可改，只允许`UNREAD→READ`。
- 收件箱按SQLite序号倒序分页，可筛未读和确认已读；对Agent只输出断言摘要与脱敏Artifact类型、Hash、大小、媒体类型和脱敏状态，不输出文件路径。
- Flowise阶段6制品只使用结构化LLM、条件、Human Input、MCP和直接回复。用户输入自然语言时间；主控回显类型、Asia/Shanghai时间、Cron或runAt、misfire、宽限和重试，确认后才幂等创建。ON_DEMAND不调用调度写工具。
- MCP 6.0.0共14项冻结工具，其中11项ACTIVE；`failure_get/repair_propose/decision_submit`继续稳定失败关闭至阶段7。
- `verify:i8:stage6`覆盖阶段1—6；`verify:i8:stage6:live`使用固定Chromium实际执行ONE_TIME调度，并在主动制造`current_version`漂移后证明运行仍绑定旧版本。此证据仍不证明真实Flowise发布、MiMo对话或HiAgent运行。

## 21. 阶段7实现记录（2026-07-21）

- migration 015新增十一类`i8_failure_incidents`、可分级且不可变的`i8_step_failure_envelopes`、最多3次的`i8_script_patch_proposals`、独立修复稳定性批次/六个Run/证书和人工决定表。
- 正式失败先由确定性分类器产生CTX-L1；一次修复验证失败后写入只含相邻摘要的CTX-L2，第二次失败升级CTX-L3。不得读取整库、整日志、凭据、Storage State或项目源码补充上下文。
- `ScriptPatchProposal`拒绝完整源码、未知字段、任意选择器和断言弱化，只允许受控目标映射、固定等待、受控动作参数、步骤顺序及等强/更强断言实现。
- 每个修复尝试把安全来源元数据写入生成脚本头部，使候选ID、脚本版本、脚本Hash、Manifest Hash和来源链均可区分和审计；第三个候选后稳定拒绝第四次尝试。
- 每个候选必须重新完成1440×900和390×844各3次的纯Playwright验证；失败不发证，成功后仍保持`WAITING_USER`。只有显式`ACTIVATE`建立新`script_versions`和READY Plan。
- 激活本身不自动运行、不迁移Schedule。用户后续显式调用`run_submit`或新建Schedule时，Harness优先选择已激活修复版本并复核精确版本/Hash；历史Schedule继续绑定原版本。
- MCP 7.0.0启用全部14项工具；阶段7 Flowise同源制品只使用结构化LLM、条件、循环、Human Input、MCP和直接回复，不使用Code/HTTP/数据库/文件/Shell/浏览器节点。
- 本机自动化测试覆盖十一类、L1/L2/L3、三次上限、白名单、六次重新签证、显式激活、修复版本按需运行和新调度绑定。真实Flowise发布、MiMo对话、固定Chromium阶段7复验和HiAgent仍为独立门禁。
