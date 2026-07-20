# 衡准自动化回归平台唯一实施顺序

<!-- IMPLEMENTATION_ORDER_AUTHORITY: v54-implementation-batches -->

本文件是当前项目**唯一实施顺序权威**。任务状态仍只以 [`agent/backlog.yaml`](../../backlog.yaml) 为准；架构、设计、验收矩阵、证据、历史计划和研究文档只能提供约束或证据，不得另行定义先后顺序。

## 控制规则

- 只有本文件可以定义项目级批次、先后关系、并行关系、入口条件和退出条件。
- `agent/backlog.yaml` 只记录任务状态、依赖、允许路径和验收标准，不复制批次顺序。
- `docs/`、`documents/`、`rag/`、`contracts/` 与其他 `agent/plans/active/` 文件只补充参数、接口、架构、技术方案、代码设计、验证方法或证据，不得建立第二套全局阶段编号或排期。
- 某个缺口报告、运行手册或测试案例中的“步骤”只约束该项操作，不构成项目实施顺序；若与本文件冲突，以本文件为准。
- I0—I7 是已经完成并冻结的 Coze/Harness 历史实施序列，不得改写其历史证据。2026-07-20 起唯一后续阶段为 I8；I8 使用 Windows 原生 Flowise 3.0.12 作为个人/办公电脑主控、SQLite 作为平台和回归领域持久化、MCP 作为唯一平台外工具通道，并只实现能够映射到 HiAgent 已证明能力交集的内容。

## 当前交付目标

实习交付物继续聚焦自动化回归测试闭环。I0—I7 已交付的 Coze 演示保留为历史基线；后续目标入口改为私有化 Flowise Agentflow V2，平台外调用只经过 MCP。复兴银行继续作为稳定、可演示的本机被测系统和个人作品集；当前个人电脑阶段不把 Flowise 成功写成 HiAgent 成功，也不要求整个银行前端、全部 S0—S7 或全部业务闭环完成。

## 环境交接边界

- **I0—I7 只证明历史本机 Coze 演示。** 其范围止于当时的 Coze Studio、Harness、SQLite、Playwright、Midscene、复兴银行、脱敏证据和离线恢复。
- **I8 个人电脑阶段使用 Flowise。** 本阶段实现 Flowise Agentflow、Flowise 平台知识库、SQLite 结构化执行知识库、MCP、确定性作者化内核和便携制品，不继续扩展 Coze 或 Dify 专用资源，不在产品中建设 RAG 子系统。
- **办公电脑阶段重新恢复 Flowise。** 只从同源定义和便携包重建，不复制个人电脑凭据、会话、平台数据库或缓存。
- **HiAgent 由测试环境阶段独立验收。** 从当前实现提取 MCP 契约、Workflow 映射、知识制品、运行手册和脱敏证据后，在实际 HiAgent 环境重新注册、调试、发布和验收。
- **证据不得互相冒充。** 本机 Coze 成功不证明 HiAgent 已安装、可访问或可运行；未来 HiAgent 成功也不改写本机演示的历史验收事实。
- **外部门禁已移交。** `PLAT-V007` 目标租户容量和 `PLAT-V010` 目标 HiAgent 网络不属于当前对话剩余工作，不阻塞已完成的 I1—I7；它们只在未来 HiAgent 对话中重新进入执行状态。
- **当前仓库只保留迁移输入。** 不在本机项目中保存 HiAgent 凭据、会话、平台数据库或运行态；所有目标环境敏感配置由新对话在现场安全注入。
- **I8 是当前唯一新增阶段。** 详细冻结实现规格见 [`docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md`](../../../docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md)。该规格只展开 I8 的数据结构、代码边界和验收，不拥有全局排期权；若与本文件冲突，以本文件为准。

## Midscene 与 Playwright 强制协作契约

本节是所有批次、案例、修复和运行方式必须遵守的代码级控制规则。任何辅助设计、Agent 提示词、Workflow、Skill、Worker 或测试不得扩大下列职责。出现职责重叠或证据冲突时必须失败关闭，不得由模型自行裁决。

### 0. 用户输入、Agent 平台 Workflow 与主控 LLM

用户正常使用时只提交自然语言案例描述，例如“验证客户使用账号密码登录后，右上角姓名和个人资料一致”。不得要求用户填写 `namespace`、幂等键、执行路由、凭据别名、风险等级、工具顺序、`taskId` 或其他平台实现参数。

Agent 平台必须用可迁移、可公开配置的 Workflow 承接自然语言输入，并严格按以下节点处理。个人/办公电脑使用 Flowise Agentflow V2，测试环境使用 HiAgent；任何仅在 Flowise 存在而 HiAgent 无等价能力的节点不得进入正式链路：

1. `NaturalLanguageCaseIntake`：接收案例描述，平台生成 `requestId`、受控 `namespace` 和首个幂等键；原始输入只作为案例需求，不作为工具参数模板或脚本源码。
2. `KnowledgeGate`：从运行时权威知识库检索适用的业务规则、页面契约、风险规则和证据要求，并冻结 `knowledgeSnapshotId / version / contentHash / citationIds`；无权威命中时要求用户补充或返回证据不足，不得用仓库文档或模型记忆补齐。
3. `CaseNormalization`：主控 LLM 将输入转为受 Schema 约束的 `RegressionCaseDraft`，至少包含目标、前置条件、风险、步骤意图、业务断言和所需证据；技术参数由 Workflow/Harness 注入。
4. `ClarificationGate`：只有缺失信息会实质改变业务行为、风险或断言时才向用户提出最少问题；能够由知识库、契约或安全默认值确定的内容不得反问用户。
5. `AcceptanceSummary`：在首次浏览器作者化前向用户展示人类可读的目标、前置条件、关键步骤、断言、证据和风险摘要；只有摘要改变业务含义或包含高风险动作时才要求确认。
6. `IntentPlan`：主控 LLM 先生成页面无关的业务意图、分支、前置条件、失败出口和数据生命周期，不生成定位器或可执行源码。
7. `ExecutableActionPlan`：Harness 在受控探索结果基础上编译可执行原子动作，固定页面签名、允许目标、风险、重试/分支规则、Fixture 引用和断言；它取代含义模糊的 `FullActionPlan`，并以版本化记录写入 SQLite。
8. `AuthoringDispatch`：Harness 按数据库游标和租约逐次发放分级动作上下文；Midscene 与 Playwright 不读取 Agent 的完整对话历史。
9. `ScriptBuildAndVerify`：所有动作事实验证完成后，Script Package Builder 通过有限 DSL 生成候选 Playwright 包，再由纯 Playwright Worker 在新 BrowserContext 中完成稳定性验证。
10. `UserDeliveryAndChoice`：只有稳定性验证通过后，Workflow 才向用户返回受控脚本预览、版本、Hash、断言和证据，并提供保存、激活、按需、定期或一次性定时选择。

主控 LLM 是自然语言理解、结构化计划和限域修复的唯一推理主体，但不是状态权威、浏览器执行器、代码仓库维护者或最终通过判定者。所有工具调用参数必须来自 Workflow 的结构化状态、Harness 返回值或用户明确确认，禁止要求用户在普通案例描述中编写给 Agent 的操作提示。

### 1. Midscene：视觉理解与受控作者化 Agent

Midscene 只负责在 Harness 发放的单个动作租约内完成视觉理解和候选交互，不负责生成、批准或正式执行 Playwright 脚本。

允许职责：

- 只读取 Harness 提供的 `previous / current / next` 三动作窗口、当前页面截图、受控页面状态和允许的语义目标；不得读取完整案例库、SQLite、凭据原文或历史会话作为长期记忆。
- 在 PLAT-V014 对应动作仍为 `VERIFIED`、风险为 LOW/MEDIUM 且目标在白名单内时，执行受限的 `aiLocate`、`aiInput`、`aiTap`、`aiScroll` 等原子动作。
- 输出结构化视觉观察、候选目标、置信信息、动作结果和页面状态；输出只能作为候选作者化证据，不能成为业务事实或通过结论。
- 在定位不唯一、模型超时、页面漂移、动作自报成功但事实不一致或能力状态降级时返回失败/歧义，交由 Harness 选择纯 Playwright 路线或等待人工处理。

禁止职责：

- 禁止生成、修改、保存、激活或直接运行 Playwright 源码；禁止输出任意 JavaScript/TypeScript 作为可执行正式脚本。
- 禁止决定 DOM、URL、请求、响应、数据库状态或业务断言是否通过；禁止把视觉相似、模型描述或动作自报成功当作事实。
- 禁止接收账号、密码、Token、Cookie、Storage State、绝对路径、Shell 命令或任意文件系统权限。
- 禁止直接执行高风险提交、转账确认、审批、冲正、核销、日终、批量操作、权限变更或删除。

### 2. Harness Script Package Builder：唯一脚本生成桥梁

Playwright 是浏览器自动化运行库，Midscene 是视觉 Agent；二者都不是不受控的代码生成器。新 Playwright 脚本必须由 Harness 管理的确定性 `Script Package Builder` 生成，这是 Midscene 作者化结果进入 Playwright 候选脚本的唯一合法路径。

- 输入只能是版本化案例、已验证原子动作、Playwright 事实记录、稳定语义目标、断言契约和受控 Fixture 引用。
- 使用仓库内审查过的模板和版本化有限 DSL 生成候选包。I8 首版 DSL 只允许 `goto`、`fill`、`click`、`select`、`waitForURL`、`waitForResponse`、`expectVisible`、`expectText`、`expectEqual`、`screenshot`；禁止执行模型返回的任意源码、动态 `eval`、运行时包安装、任意模块导入、任意 URL、任意文件访问或命令执行。
- 候选包至少包含：`candidateId`、`scriptId`、版本、固定入口、步骤映射、断言映射、Fixture 引用、允许的定位器、源码/配置 Hash、生成器版本和来源计划版本。
- 候选源码和运行证据进入 Harness 受管 Artifact/候选目录与 SQLite 元数据，不直接覆盖仓库固定脚本，不自动成为 `SCRIPT_VALIDATED`，也不因生成成功而视为可运行。
- 当前代码若仍将 `AUTHORING_REQUIRED` 直接绑定到 `SCRIPT_CATALOG` 的既有脚本，只能标记为“原子动作作者化与预置脚本验证”，不得宣称实现了 Playwright 新脚本生成。

脚本生成时，主控 LLM最多提供结构化的 `ScriptIntent` 或受限 `ScriptPatchProposal`；Script Package Builder 必须拒绝模型提供的完整任意源码。允许的补丁仅限白名单定位器映射、等待条件、受控动作参数、步骤顺序和不削弱业务契约的断言表达式，并由 Builder 重新生成完整候选包。

### 3. Playwright：确定性执行、独立验证与取证底座

Playwright 对浏览器事实和正式回归结果负责，不接受 Midscene 的通过结论，也不依赖主控 LLM 在执行时继续规划。

- 作者化阶段：对每个 Midscene 候选动作独立验证目标唯一性、DOM/ARIA、URL、请求、响应和业务状态；任一必需维度失败即不得推进动作游标。
- 候选验证阶段：在全新 BrowserContext、固定 Node/Playwright/Chromium 运行时、隔离 Fixture 和受限网络中，对 Script Package Builder 生成的候选包执行语法/依赖/白名单检查和完整案例回归；首版稳定性门禁固定为桌面与窄屏两个视口各连续 3 次，共 6 次全链路全部通过，每次使用独立 Fixture、无残留登录态且证据 Hash/断言集合一致，并生成 `StabilityCertificate`。
- 正式执行阶段：只运行版本一致且状态为 `SCRIPT_VALIDATED` 的脚本包；不得调用 Midscene、主控 LLM 或视觉模型进行临场修补。
- 取证阶段：生成脱敏报告、遮罩截图、步骤日志、Trace/视频（案例要求时）、Hash 和断言摘要；事实结果只取自 Playwright 与受控业务接口。
- 失败阶段：输出确定性失败码和证据，交给 Harness 分类；禁止自动改写脚本、放宽断言、重复提交有副作用动作或自行批准修复。

### 4. 风险路由与提交权

| 场景 | Midscene | Playwright | 最终提交权 |
|---|---|---|---|
| LOW/MEDIUM 且能力已验证 | 可执行受控原子动作 | 必须逐动作独立验证 | 仅验证通过后由 Harness 推进 |
| 定位能力降级或结果歧义 | 只返回候选/失败，不执行提交 | 使用稳定定位器执行或终止 | Harness 依据门禁决定，不由模型决定 |
| HIGH 风险或业务写操作 | 最多提供视觉候选定位 | 完成 DOM/ARIA 唯一性检查、业务前置校验与受控提交 | 需要案例策略及必要人工确认 |
| 正式回归与定时调度 | 禁止参与 | 独立执行 `SCRIPT_VALIDATED` 脚本 | Harness Schedule/Run 状态机 |

### 5. 候选脚本到正式脚本的强制状态机

```text
用户自然语言 CaseDescription
-> NaturalLanguageCaseIntake
-> KnowledgeGate
-> 主控 LLM 生成 RegressionCaseDraft
-> Workflow 返回 AcceptanceSummary 并按风险执行最小确认
-> 主控 LLM 生成 IntentPlan
-> Harness 编译并持久化 ExecutableActionPlan
-> AUTHORING_REQUIRED
-> Midscene 受控视觉理解与候选定位
-> Harness 从 SQLite 发放 CTX-L1/CTX-L2/CTX-L3 分级动作上下文
-> Playwright 重放动作并逐动作事实验证
-> PLAYWRIGHT_ACTIONS_VERIFIED
-> Script Package Builder 生成候选包
-> CANDIDATE_GENERATED
-> 纯 Playwright Worker 在 2 个视口各连续 3 次，共 6 次隔离完整回归
-> STABILITY_CERTIFIED
-> WAITING_USER
-> Workflow 返回脚本预览、验证结果和 StabilityCertificate
-> 用户在主控对话选择 SAVE_ONLY / ACTIVATE
-> ACTIVATE 后成为 SCRIPT_VALIDATED
-> 用户选择 ON_DEMAND / RECURRING / ONE_TIME
-> 用户明确确认后才创建或不创建 Schedule
```

任何阶段不得越级。特别禁止 `Midscene 动作通过 -> 直接 SCRIPT_VALIDATED`、`候选生成成功 -> 自动激活`、`单次 Playwright 通过 -> 稳定性通过`、`正式运行失败 -> 运行时调用 Midscene 修补后继续`、`脚本激活 -> 自动创建 Schedule`。稳定性验证已经是激活前的真实纯 Playwright 执行；激活后不再强制重复一次内容相同的“首次正式运行”，只有用户选择立即按需运行或创建调度时才产生新的正式 Run。

动作上下文必须以 SQLite 中的 `ExecutableActionPlan + cursor + action lease + verified action record` 为权威。`CTX-L1` 只含当前动作完整定义、页面签名、不变量、风险、允许目标、Fixture 引用和最近事实观察；`CTX-L2` 增加上一动作脱敏结果和下一动作最小预览；`CTX-L3` 只在分支/修复需要时增加最小依赖锥，不得发送完整计划或完整对话。工具响应另用 `OUT-L0...OUT-L3` 预算，二者不得混称。视觉 LLM 完整窗口固定 16,000 tokens（输入最多 12,000、输出保留至少 4,000），主控 LLM 完整窗口固定 1,000,000 tokens（输入最多 967,232、输出保留至少 32,768）；窗口容量不得扩大数据授权。Midscene 输出后，Playwright 必须在受控页面状态中重放并验证，结果写回数据库后 Harness 才能推进游标；Agent 对话文本不得直接推进动作状态。

### 6. 稳定性验证后的交付与调度选择

生成的候选 Playwright 包只有在取得 `StabilityCertificate` 后才能返回受控预览；只有用户明确激活为 `SCRIPT_VALIDATED` 后，才能作为可复用回归能力。返回内容至少包括：

- `caseId / caseVersion / planId`；
- `scriptId / scriptVersion / scriptHash / generatorVersion`；
- 稳定性验证的 `validationRunIds / status / viewportSet / consecutivePasses`；
- 脱敏断言摘要和 Artifact 元数据；
- 可选择的后续执行方式及其真实支持状态。

主控对话必须等待用户明确选择下列一种方式：

1. `ON_DEMAND`：不创建调度，仅保存已验证脚本，后续由用户手动发起回归。
2. `RECURRING`：用户用自然语言说明周期和时间，Workflow 规范化为五字段 Cron、IANA 时区、`local` 环境、`fixtureScope`、misfire 策略、宽限时间和最大瞬态重试次数；用户只确认人类可读摘要，不需要编写 Cron。
3. `ONE_TIME`：用户用自然语言指定未来时间，Workflow 规范化为带时区的 `runAt`、`local` 环境、`fixtureScope` 和幂等键；用户只确认人类可读摘要，执行完成后自动终止，不转成周期任务。

调度控制规则：

- `RECURRING` 和 `ONE_TIME` 都必须绑定精确的 `caseVersion + planId + scriptId + scriptVersion`；禁止静默跟随“最新脚本”。脚本升级后必须重新验证，并由用户明确选择是否迁移既有调度。
- 只有候选取得 `StabilityCertificate`、用户明确激活且证据完整时才展示调度选项；`FAILED`、未激活、证据不完整或脚本版本漂移时禁止创建调度。
- 用户选择 `ON_DEMAND` 不得调用任何调度写工具；选择 `RECURRING` 或 `ONE_TIME` 后，主控必须先回显规范化配置并获得最终确认，再执行一次幂等创建。
- 调度创建后必须回查并向用户返回 `scheduleId`、类型、状态、绑定版本、下次/计划执行时间、时区和脱敏配置摘要。
- 当前 Harness 已实现五字段 Cron 的 `RECURRING` 调度，但尚未实现 `ONE_TIME runAt`，也未完整固定 `scriptVersion`；在对应契约、SQLite migration、状态机、工具和测试落地前，主控必须将这两项标记为未实现，不得用 Cron 或模型记忆模拟。
- 正式调度执行只运行已验证 Playwright 脚本，禁止调用 Midscene、主控 LLM 或视觉模型；失败后进入事故与人工恢复流程，不得自动作者化或自动激活修复。

定期或定时任务由本地 Harness Schedule 触发本地纯 Playwright Worker。运行结果必须持久化为可恢复的 `runId / taskId / resultArtifactId`：用户对话仍在线时由 Workflow 轮询并返回；用户离线时由 Harness 保存，用户下次进入主控对话或查询 `scheduleId` 时返回最近运行状态、断言摘要和脱敏证据元数据。不得依赖 Agent 会话持续存活，也不得因为无法主动推送而丢失结果。

### 7. 主控 LLM 的逐步骤限域修复协议

正向链路任一步骤失败时，Harness 必须生成脱敏的 `StepFailureEnvelope`，只包含：`stage`、对象 ID/版本、确定性错误码、当前步骤的结构化输入摘要、实际输出摘要、相关 Artifact 引用、允许的修复范围、当前尝试次数和最大尝试次数。修复上下文沿用 `CTX-L1 当前动作 / CTX-L2 相邻动作 / CTX-L3 最小依赖锥` 分级，默认只发 `CTX-L1`，只有确定性规则证明不足时才能逐级扩大。主控 LLM 不得读取整个项目、其他案例、SQLite 文件、凭据或仓库源码。

允许的限域修复：

- `KnowledgeGate / CaseNormalization`：补充或重构 `RegressionCaseDraft`，但不得虚构知识证据。
- `FullActionPlan / AuthoringDispatch`：只调整当前失败动作及必要的相邻动作预览，不能改写已验证动作历史或跳过风险门禁。
- `ScriptBuildAndVerify`：只提交受 Schema 限制的 `ScriptPatchProposal`，微调当前生成候选包的白名单定位器、等待条件、受控动作参数或不削弱契约的断言实现。
- `Schedule / ResultDelivery`：只修正调度参数或恢复查询引用，不能改写测试结论。

禁止的修复：

- 禁止修改复兴银行、Harness、Worker、Agent 平台、项目配置、依赖、测试框架或仓库中的任何既有代码。
- 禁止降低、删除或反转业务断言，禁止把失败改写为通过，禁止修改原始案例目标以适配错误页面。
- 禁止执行任意模型源码、Shell、包安装、文件写入、数据库直写或未注册工具。
- 禁止无限自修复。每个阶段默认最多 3 次候选修复；耗尽后进入 `WAITING_USER/UNRESOLVED` 并返回真实失败证据。

每次脚本微调都必须产生新候选版本和 Hash，并从纯 Playwright 的语法、白名单、隔离完整回归重新开始。只有最新候选在纯 Playwright 中完整通过，才允许提交给用户；“主控 LLM 已修复”本身不是完成证据。

### 8. 回归失败后的反向流程

反向流程与正向流程共用相同的 Harness 状态、三动作窗口、候选脚本版本、纯 Playwright 验证和人工激活门禁：

```text
正式/定期/定时 Playwright 回归 FAILED
-> Harness 保存脱敏证据并生成 FailureIncident
-> Harness 确定性分类
-> 周期/定时任务进入受控暂停或失败状态
-> 主控 LLM 只接收当前 FailureEnvelope
-> 按分类选择报告、重试、重新作者化或候选脚本微调
-> Midscene 仅在需要视觉重新定位时接收失败动作三窗口
-> Playwright 验证新定位/动作事实
-> Script Package Builder 生成新候选版本
-> 纯 Playwright 完整隔离回归
-> WAITING_USER
-> 用户明确批准或拒绝
-> 批准后激活新 scriptVersion
-> 用户明确决定是否复跑及是否迁移原 Schedule
-> 纯 Playwright 复跑并将结果返回主控对话
```

分类处理规则：

- `ENVIRONMENT`：有限重试或等待环境恢复，不生成脚本补丁；最终失败返回用户。
- `AUTHENTICATION`：检查凭据别名、角色和认证环境的受控状态，不向 LLM 暴露凭据，不自动改脚本绕过认证。
- `CONTRACT`：报告接口/页面契约漂移；若属于被测项目缺陷，只形成缺陷记录，不允许主控 LLM 修改项目代码。
- `LOCATOR`：允许 Midscene 在失败动作三窗口中重新定位，Playwright 做唯一性和业务事实验证，再由 Builder 形成定位器候选版本。
- `ASSERTION`：禁止自动弱化断言。实现错误只能微调生成脚本的断言代码并完整复验；需求期望变化必须新建案例版本并获得用户确认。
- `MODEL`：记录模型失败并使用已验证降级路线或等待恢复，不得把模型自报成功当作事实。
- `TOOL`：有限重试注册工具；持续失败返回工具事故，不生成业务脚本补丁。
- `FIXTURE_DATA`：重新准备独立 Fixture 或报告数据不可用，不得复用污染数据掩盖失败。
- `PRODUCT_DEFECT`：形成被测系统缺陷和可复现证据，禁止修改回归脚本迎合错误行为。
- `FLAKY_TIMING`：只允许在明确事件/响应/状态条件上调整有限等待，禁止无上限 sleep 或盲目重跑。
- `SCRIPT_LOGIC`：只通过受限 DSL/`ScriptPatchProposal` 形成新候选版本，必须重新执行完整稳定性门禁。

修复候选即使纯 Playwright 验证通过也不得自动激活。原 Schedule 保持暂停或绑定旧版本，直到用户明确批准新脚本并明确选择迁移；迁移后必须绑定新 `scriptVersion`，回查配置，再执行纯 Playwright 复跑。所有结果仍通过任务查询和 Artifact 元数据返回用户。

### 9. 主控对话的可见输出边界

- 作者化阶段只展示动作进度、失败/歧义、候选 ID、版本、生成器版本、脚本 Hash、有限差异摘要、验证状态和需要的用户选择。
- 正式运行只通过 `task_get` 等受控查询返回状态和断言摘要，通过 `artifact_get_metadata` 返回证据类型、大小、脱敏状态和 Hash。
- 默认不得把账号密码、Cookie、Token、Storage State、本机路径、完整日志、未脱敏截图或任意可执行源码直接写入对话框。
- 如果需要查看候选源码，必须新增受控的只读源码预览/下载能力，执行鉴权、分页、脱敏、Hash 校验和审计；不得借用 `artifact_get_metadata` 冒充源码已经输出。

### 10. 当前实现判定与后续门禁

- 当前已经实现：Harness/SQLite 层的完整计划游标、上一动作摘要/当前动作/下一动作预览状态窗口、单动作租约、Playwright 逐动作验证、三条预置 Playwright 脚本正式执行、脱敏 Artifact 元数据和历史 Coze 主控对话结果摘要。`npm.cmd run test:i4` 当前 3/3 通过。
- 当前视觉消费限制：历史 Midscene Worker 只把 `currentAction.prompt` 交给模型；上一动作摘要、下一动作预览、最近观察和页面状态虽然由 Harness 返回，却未构造成受预算治理的 `ActionContextEnvelope` 送入视觉模型。因此“三动作状态窗口已实现”不得表述为“视觉 LLM 滑动上下文已实现”。
- 当前尚未实现：普通案例描述到完整工具参数的无提示自然语言 Workflow、Script Package Builder 真实生成新的 Playwright 源码包、逐阶段 `StepFailureEnvelope` 与限域 LLM 修复、候选源码受控预览、生成脚本的隔离完整回归与激活后按新版本正式执行、一次性 `ONE_TIME runAt` 调度、调度对精确 `scriptVersion` 的完整绑定，以及定期运行结果在后续对话中的完整恢复交付。
- 在上述缺口关闭前，所有现有 I4/I5 “作者化完成”证据只证明原子动作门禁、预置脚本验证或定位器配置候选，不证明“Midscene 已生成新的 Playwright 脚本”。
- 后续任何脚本作者化开发必须先按本节补齐 Workflow 输入契约、消息 Schema、SQLite 状态、三动作窗口、生成器、Worker 白名单、纯 Playwright 隔离验证、逐步骤限域修复、人工激活、调度版本绑定和 Agent 平台结果查询链，再扩展视频案例或更大范围自动修复。

## 并行轨道与门槛

I8 期间两条轨道并行：

- **平台轨道按 I8 开工**：建设 Flowise 可迁移 Agentflow、Flowise 平台知识库、双 SQLite 隔离、MCP、Harness 确定性作者化、Script Package Builder、Worker 和证据链。仓库 RAG 只服务开发，不进入产品。它不依赖 `FE-DEFECT-001` 全部完成，也不得使用 HiAgent 无等价证据的 Flowise 专有能力。
- **被测系统轨道按案例收敛**：只修复首批案例实际经过的页面、API、角色、Fixture、稳定定位器和错误恢复。未被首批案例使用的前端缺陷不得阻塞平台基础建设。

每个银行案例只有在接入 Harness 执行前才需要通过自己的案例门禁：

1. 入口路由和目标终态明确；
2. API、角色和错误语义与契约一致；
3. 合成 Fixture 可通过正式接口或 Test Support API 准备和清理；
4. 稳定 `data-testid`/ARIA/URL 可供 Playwright 使用；
5. 手工或现有自动化可重复通过，并能生成脱敏证据。

一个案例未通过只阻塞该案例，不阻塞 MCP、Harness、SQLite、Artifact、Builder、Worker 或其他已就绪案例。

## 实施批次

### I0：银行案例就绪门禁（与 I1 并行）

- 保护当前脏工作区，核对并提交现有银行修复；不混入平台运行态、凭据、日志和缓存。
- 固定首批三个低风险案例：
  1. 客户账号密码登录与个人资料一致性；
  2. 客户账户列表、账户详情与本人数据隔离；
  3. 错误凭据、无权限或会话失效后的安全拒绝与恢复。
- 内部转账、贷款、日终和运营审批保留为后续扩展，不阻塞实习最小闭环。

### I1：单目录产品骨架与平台基础（历史第一开发步骤，已冻结）

- 在 `platform/hengzhun-regression-system/` 建立 `coze/`、`harness/`、`worker/`、`runtime/`、`contracts/`、`tests/`、`scripts/`、`docs/` 与 `.data/` 的单目录产品边界。
- 将现有 `platform/runtime` 复制为产品目录内的固定运行时并完成只读校验；新副本通过前不得删除旧运行时，旧运行时清理属于单独、可回滚动作。
- 建立统一 `package.json`、忽略规则、目录结构校验和一键验证入口；运行数据、日志、证据、凭据与缓存只进入 `.data/`，不得入库。
- 建立可上传 Skill、可导入 OpenAPI、公开界面配置清单和平台一致性测试目录；本地生成制品不得冒充 Coze/HiAgent 已安装或已发布证据。
- 部署本机 Coze Studio，完成模型、Knowledge Base、Agent/Workflow 的最小可用检查。
- 确认 Coze 容器到 Harness 的本机受控网络路径；不得暴露银行内部端口或凭据。
- 按 [`PLAT-V001`～`PLAT-V003`、`PLAT-V006`、`PLAT-V009`、`PLAT-V013`](../../../docs/current-state/coze-hiagent-verification-register.md) 完成 Skill、OpenAPI 参数、同步受理窗口、本机网络和 HiAgent 2.5.1 能力交集验证；未经验证的 Coze 独有能力不得进入实现。

I1 当时第一步的退出条件：目录结构校验通过、产品目录内固定运行时校验通过、`docs / rag / documents` 索引关系通过验证，并且没有写入或输出凭据。Coze Studio 部署与平台公开界面实测属于 I1 当时的后续子步骤，不因骨架完成而被标记完成。

2026-07-16 实施状态：上述骨架、固定运行时、本机 Coze Studio 0.5.1、合成一致性服务、内部网络、最小 Agent、Knowledge Base 与 Workflow 已落地并验证。`PLAT-V009` 已运行通过；`PLAT-V001` 在当前公开界面失败，`PLAT-V003` 与 `PLAT-V013` 部分通过，`PLAT-V006` 受 Plugin 导入入口阻塞。因此 I1 的机器基础完成，但平台退出门禁未关闭；无依赖的 I2 Harness/SQLite/Artifact 工作允许继续，依赖 Skill/Plugin 导入的工作不得冒充完成。

### I2：Harness 最小安全内核

- 建立 TypeScript/Node Harness 服务、版本化 OpenAPI 和 Coze HTTP Plugin。
- 统一回归执行标识：每次请求必须携带受控 `namespace`，每次执行生成唯一 `runId`；二者贯穿任务、日志、Artifact、Evidence 和审计事件。
- 使用服务令牌、内网 allowlist、请求 Schema、幂等键、任务 ID 和审计事件。
- 建立 `regression_platform.sqlite` 迁移、WAL、外键、`busy_timeout`、单写入队列、备份和完整性检查。
- 建立 Artifact/Evidence 元数据、Hash、受管目录和禁止入库规则。
- 完成 `PLAT-V005` 鉴权负测、`PLAT-V008` 输出预算边界测试，并使 `PLAT-V004` 的七工具 OpenAPI 至少通过无副作用导入验证。

2026-07-16 实施状态：I2 Harness 最小安全内核已落地。正式七工具 OpenAPI、`namespace + runId`、服务令牌/allowlist、Zod Schema、幂等、任务与不可变审计、SQLite WAL/外键/`busy_timeout`/单写入/备份/完整性、Artifact/Evidence 元数据与历史 L0-L3 输出预算（I8 起统一称 `OUT-L0...OUT-L3`）均通过自动验证；容器在内部网络健康运行且无宿主端口。`PLAT-V005`、`PLAT-V008` 的 Harness 侧门禁已关闭，`PLAT-V004` 已完成无副作用可导入契约验证。Coze Studio 0.5.1 公开界面的资源创建菜单仍未进入插件表单，真实导入、发布和七工具调用按本文件留在 I3，不能冒充已经完成。

### I3：第一个纵向闭环

完成以下可演示链路：

```text
用户自然语言
-> Coze Agent / Workflow
-> Harness HTTP Plugin
-> Playwright Worker
-> 复兴银行门户
-> 断言、截图、日志、Hash
-> Harness 任务结果
-> Coze 对话返回
```

第一条案例使用“客户登录与个人资料一致性”。在本批次完成前，不铺开视频导入、自动修复、定时调度或衡准 UI。

I3 退出前必须关闭 `PLAT-V004` 七工具真实调用、`PLAT-V011` 会话中断恢复和 `PLAT-V012` 首版知识检索审计链。

2026-07-17 当次完成状态：I3 在验收时关闭退出门禁。Harness/Worker 使用唯一 `regression_platform.sqlite`、独立 Worker Bearer 通道、租约重领、凭据别名、Fixture 命名空间和全新 BrowserContext；固定 Playwright 案例在真实门户完成账号密码登录，页眉姓名/头像与个人资料一致性断言为 `PASSED`，报告/遮罩截图/日志三类证据齐全且只暴露脱敏元数据与 Hash。

Coze Studio 0.5.1 在当次验收中通过公开 UI 完成七工具插件导入、调试、发布、Agent 绑定与 Agent 发布。MiMo v2.5 通过单目录内、Bearer 保护且不暴露宿主端口的兼容网关接入；网关只把上游非流式 OpenAI 响应转换为 Coze 所需 SSE，并对可安全重试的模型传输故障重试，不承接 Harness 领域状态。Knowledge Base 当次已绑定并设置自动检索，真实命中规则与引用；七工具在同一发布 Agent 的恢复会话中逐一真实调用，最终运行 `PASSED`、决策 `RECORDED/APPROVE`。`PLAT-V004`、`PLAT-V011`、`PLAT-V012` 是历史时点证据；当前资源是否仍存在必须重新以公开 UI 核对，三个 `.skill` 的 Coze 直接上传限制仍属于 I1 的既有平台差异。

### I4：三案例与 Midscene

- 三条首批案例全部通过独立 BrowserContext、Fixture 隔离和脱敏证据验收。
- 接入模型驱动 Midscene 和 Harness 三动作窗口；先覆盖 LOW/MEDIUM 操作。
- 高风险动作仅允许 Midscene 定位，必须由 Playwright 完成 DOM/ARIA 唯一性检查和提交；首批低风险案例不强行制造资金写入。
- 已验证脚本标记为 `SCRIPT_VALIDATED`，未经验证不得进入正式回归。
- 只有通过 `PLAT-V014` 稳定性门禁的 Midscene 原子动作才能进入正式 LOW/MEDIUM 路由；开放式 `aiAct` 不得因模型自报成功而放行。

2026-07-17 完成状态：I4 本机运行面与 Coze 唯一入口均已落地。三条**预置** Playwright 案例均以独立 BrowserContext、Fixture 隔离和脱敏证据通过；完整计划、三动作窗口、单活动租约、Playwright 独立事实验证、`WAITING_USER` 与人工激活门禁均已验证。该历史批次验证的是“受控原子动作作者化与预置脚本版本门禁”，不包含由 Midscene 结果生成新 Playwright 源码包的能力。`PLAT-V014` 五视口实测中 `INPUT`、`TAP`、`SCROLL` 各 10/10 通过，允许进入受控 LOW/MEDIUM 作者化；`LOCATE` 为 8/10 且出现一次错误自报成功，已标记 `DEGRADED` 并强制 `PLAYWRIGHT_ONLY`，高风险路线同样退化为纯 Playwright。

Coze Studio 0.5.1 已仅通过公开界面完成七工具 OpenAPI 插件导入、逐工具调试、发布、Agent 绑定、知识库绑定与 Agent 发布。`LOGIN_PROFILE` 从自然语言知识检索开始，真实完成 `case_create_draft -> case_get -> plan_compile -> run_submit`；MiMo 在工具返回后的规划轮发生一次 provider 504，但 Harness 任务未中断、未重复提交，恢复会话按原 `taskId` 完成 `task_get -> artifact_get_metadata` 并返回 `SUCCEEDED`、脱敏断言和 `REDACTED` 报告元数据。`run_submit.environment` 已固定为 `local`，非业务“用户问题建议”已关闭以避免额外模型调用。I4 退出门禁关闭，可以进入 I5；MiMo 规划延迟保留为非阻塞运行风险。

### I5：实习增强能力

按价值顺序追加：结构化案例导入、失败分类、脚本失效诊断、隔离修复候选、Coze 人工确认激活。本机视频拆帧和语言修复在基础闭环稳定后加入。

2026-07-17 历史完成状态：I5 已完成。`HENGZHUN_JSON_V1` 批次通过整批严格校验后原子写入唯一 `regression_platform.sqlite`；失败运行自动形成七类事故；首版定位器事故只允许白名单 `LOCATOR_OVERRIDE`，并由独立 Worker 租约和全新 BrowserContext 完成 Playwright 验证。候选验证通过后保持 `WAITING_USER`，未自动修改正式脚本；显式决策后脚本版本从 1 激活到 2，随后真实门户正式复跑 `SUCCEEDED`，报告证据为 `REDACTED`。Coze 公开界面已发布十一工具插件 v0.0.7、I5 Knowledge Base 和主控 Agent；自然语言批准改变 SQLite 权威状态，公开工具回查为候选 `ACTIVE/version 4`、事故 `RESOLVED/version 4`。重复旧版本批准被 409 拒绝。视频案例在该批次没有落地，现由 `HENGZHUN-POST-I8-INPUTS-001` 显式保留为延期需求。

### I6：调度、离线与后续扩展

- Harness Schedule 只执行 `SCRIPT_VALIDATED` Playwright 脚本，正式定时运行不调用 LLM、Midscene 或视觉模型。
- 完成互斥、misfire、补跑、失败暂停、备份恢复和离线迁移包。
- 再逐步增加转账、贷款、日终、审批等银行案例。

2026-07-18 完成状态：I6 本机运行面、离线交付和 Coze 唯一入口均已完成。Harness 已用 SQLite migration 8 落地五字段 Cron、IANA 时区、`local + fixtureScope` 互斥、`SKIP/RUN_ONCE` misfire、租约恢复、瞬态故障有限重试、最终失败暂停和版本化人工恢复；14 工具 OpenAPI、I6 单元/集成测试、非 root Harness 镜像、完整镜像离线包、Hash/SBOM、SQLite/Artifact/Evidence 备份及干净目录恢复均通过。修复模型工具协议提示和 `schedule_get` 输出 Schema 后，Coze 公开界面已发布 Harness 插件 `v0.0.10`，14 工具逐项重新调试通过，“衡准-I6-调度主控”完成自然语言创建、查询、显式停用和再次查询的真实闭环。`PLAT-V007` 容量与 `PLAT-V010` 目标 HiAgent 网络没有本机证据，现已移交未来 HiAgent 对话；银行扩展案例尚未开始。

### I7：实习交付冻结与可复现验收

- 冻结实习提交范围为 Coze 唯一入口、Harness/SQLite、Playwright/Midscene 风险路由、确定性调度、脱敏证据和离线交付；不扩建银行业务或衡准 UI。
- 建立一键 I1—I7 验收和机器可读交付记录；记录只能包含提交、版本、计数、状态、Hash/清单引用和明确的外部待验证项。
- 正式交付必须从干净提交生成，包含三张固定镜像、产品归档、SQLite 在线备份、Artifact/Evidence、SBOM 和 Hash，并在全新目录完成恢复复验。
- `PLAT-V007` 和 `PLAT-V010` 已移交未来 HiAgent 对话；本机验收只需明确保留边界，不负责关闭。

I7 退出条件：`npm run verify` 覆盖 I1—I7 并通过；正式离线交付包与当前源提交一致；三张镜像齐全；全新目录恢复后的 SQLite 完整性与 schema version 通过；交付记录不含敏感信息；当前状态、缺口登记、证据和 Backlog 一致。

2026-07-18 完成状态：I7 已关闭。提交 `37aceed` 通过 I1—I7 全量验证；正式包 `internship-20260718-i7-37aceed` 绑定该干净提交，包含三张固定镜像、产品归档、SQLite/Artifact/Evidence 备份、CycloneDX SBOM 和 Hash 清单。共 8 个清单文件、1078602394 字节，在全新目录完成 Hash 复验、三镜像加载和 SQLite schema 8 完整性检查；包目录不存在 Manifest 外文件，机器验收记录独立保存在包外且未包含凭据或业务数据。本机演示序列在此结束；`PLAT-V007`、`PLAT-V010` 与云端 HiAgent 生产就绪已移交未来 HiAgent 对话。

### I8：平台中立的确定性脚本作者化闭环（当前唯一新增阶段）

I8 不延续 Coze 或 Dify 专用实现。个人/办公电脑入口使用 Windows 原生 Flowise 3.0.12，平台外工具只通过 MCP。Flowise Agentflow 负责自然语言、语义知识检索、案例结构化、最小澄清、意图规划、人工确认和结果解释；本地 MCP/Harness/Builder/Midscene/Playwright 负责鉴权、权威状态、确定性执行、证据和审计。详细职责见 [`docs/architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md`](../../../docs/architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md)，代码级规格见 [`docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md`](../../../docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md)。

I8 内部实现顺序固定为：

1. 以 `AUD-009...AUD-013` 为基线，冻结 `RegressionCaseDraft`、`AcceptanceSummary`、`KnowledgeSnapshotRef`、`IntentPlan`、`ExecutableActionPlan` 和 `CTX-L1/CTX-L2/CTX-L3` `ActionContextEnvelope` 强类型 Schema；完成 migration 009、视觉16K/主控1M token预算字段与门禁、图像 token 估算、预算错误码/审计，并让 Worker 实际消费完整 Envelope。历史 I4 状态窗口只能作为游标/租约基础，不能代替本步骤。
2. 建立只接收自然语言案例描述的可迁移 Agentflow 定义；技术参数由 Flowise/Harness 生成，Flowise 外部调用全部经过 MCP。
3. 实现有限 DSL、确定性 Script Package Builder、候选版本/Hash/来源追踪和 Worker 白名单执行。
4. 实现 `StabilityCertificate`：两个视口各连续 3 次、共 6 次，新 BrowserContext、独立 Fixture、无残留认证、断言/证据一致。
5. 实现鉴权、分页、脱敏、Hash 校验和审计完备的脚本预览/下载，以及 `SAVE_ONLY / ACTIVATE` 人工选择。
6. 将 Schedule 精确绑定到 `caseVersion + planId + scriptId + scriptVersion`，再实现 `ONE_TIME runAt` 和离线结果收件箱；用户通过自然语言给出时间，系统回显规范化摘要，不要求用户编写 Cron。
7. 实现分级 `StepFailureEnvelope`、十一类事故和受限 `ScriptPatchProposal`；每个修复候选都必须重新通过完整稳定性门禁，禁止运行时自修补、自动激活或修改被测项目代码。

2026-07-20 阶段1完成状态：第1项已完成代码与自动测试落地。强类型领域 Schema、migration 009、`ActionContextEnvelope`、不可变预算审计、L1→L2→L3 歧义升级、视觉16K/12K与主控1M预算函数、图像token预估、确定性错误码、Worker完整Envelope消费和Worker OpenAPI 1.3.0均已实现；`verify:i8:stage1` 9/9、I2—I6历史回归32/32通过。真实MiMo usage当前按接口能力记录为`NOT_EXPOSED`，Flowise主控交接和真实模型E2E属于第2项及后续门禁，不能由阶段1证据代替。

2026-07-20 阶段2完成状态：第2项已完成代码、制品和本机集成验证。`flowise/i8/agentflow-v2.json` 只接收 Chat Input 案例描述，平台知识、结构化 LLM、最小澄清、Human Input、MCP 与结果回显均有 HiAgent 语义映射；没有 Code、HTTP、数据库、文件或 Shell 节点。migration 010 与 Harness 实现 `PREPARED → REJECTED/AWAITING_STAGE3` 权威交接，MCP Server 以 Bearer、固定 namespace、确定性幂等、8 KiB 输出门禁注册14工具，其中阶段2启用 `case_prepare / authoring_submit / authoring_get`。阶段3在此基础上启用 `candidate_get`，其余10项稳定失败关闭。阶段2及阶段3累计验证使用 Flowise 3.0.12 的真实 `MCPToolkit` 贯通 MCP→Harness→SQLite；当前进程未注入 MiMo 密钥且未发布运行中 Agentflow，因此不能声明真实 MiMo 对话或 HiAgent 运行验收。

2026-07-20 阶段3完成状态：第3项已完成代码与本机集成验证。migration 011、严格 `ExecutableActionPlan`、10操作有限 DSL、仅 `ROLE/LABEL/TEST_ID` 定位器、确定性 Script Package Builder、候选版本/Hash/来源链、不可变 SQLite 记录、文件 Hash 复核和 Worker 白名单执行已经落地。相同规范化输入生成字节一致脚本与相同 Hash；`candidate_get` 不接收用户提供的并发版本，而由 MCP 查询 Harness 后注入受控版本。`verify:i8:stage3` 15/15，Worker 测试通过受控 Playwright Page 契约并拒绝篡改包。阶段3没有运行真实 Chromium、没有生成 `StabilityCertificate`，也没有激活或调度候选；第4项六次真实浏览器稳定性门禁是下一步。

2026-07-20 阶段4完成状态：第4项已完成代码、常驻Worker接入和真实浏览器验收。migration 012冻结批次、六个验证样本与不可变`StabilityCertificate`；样本严格为1440×900和390×844两个视口各1—3次，每次使用全新BrowserContext、空storage state和独立Fixture。Worker复核候选/manifest/运行时Hash，输出脱敏报告、PNG截图和步骤日志并验证文件Hash；任何一次失败均整批失败、不重试、不签证。`verify:i8:stage4`覆盖阶段1—4与内部OpenAPI，真实复兴银行门户另以固定Chromium完成6/6并签发证书。阶段4未实现脚本预览、下载、保存、激活或调度；第5项受控交付与人工选择是下一步。

2026-07-20 阶段5完成状态：第5项已完成代码、本机集成和真实门户验收。migration 013冻结不可变交付决策及短时一次性下载授权；只有`StabilityCertificate=PASSED`且候选、manifest、脚本Hash复核一致时才能按完整行分页预览或下载。用户可明确`SAVE_ONLY / ACTIVATE / REJECT`；激活原子绑定精确`caseVersion + executablePlanVersion + scriptId + scriptVersion + scriptHash`，保留旧版本且不自动运行、不创建调度。激活后可另行提交一次按需回归，常驻Worker只用固定Chromium和纯Playwright执行已激活候选，结果可由`task_get`查询。MCP现有8项ACTIVE、阶段6—7的6项继续失败关闭；Flowise阶段5续办制品只使用MCP、条件、人工确认、结构化LLM和直接回复。`verify:i8:stage5`累计25/25通过，真实复兴银行门户完成六次签证、预览、精确激活和正式复跑。阶段5没有实现周期/一次性调度或离线收件箱；第6项是下一步。

I8 退出条件全部为硬门禁：

- 普通用户只输入案例描述即可完成首个登录/资料一致性案例的结构化、作者化、脚本生成和稳定性验证；
- 新生成的脚本不是 `SCRIPT_CATALOG` 预置脚本副本，来源链可由计划版本、DSL、生成器版本和 Hash 重建；
- 3 次 × 2 视口验证全部通过，任一失败都不得生成 `StabilityCertificate`；
- 用户在对话中看到人类可读验收摘要、受控脚本预览和真实验证结果，并可明确保存、激活、按需或调度；
- 正向链路、正式回归失败反向链路、版本绑定、一次性执行和离线结果恢复均有契约测试、SQLite 迁移测试、Worker 集成测试和真实浏览器 E2E；
- Flowise 未使用任何无 HiAgent 等价证据的专有能力，Flowise 成功不冒充 HiAgent 已验证；
- `npm.cmd run verify`、文档校验和 I8 专项验证全部通过，且证据不含凭据、绝对路径、未脱敏截图或完整敏感日志。

在 I8 退出前，不开始视频案例、任意代码生成、跨项目自动修复、衡准 UI 扩建或新增银行高风险业务案例。

## 明确不阻塞当前开工的事项

- `FE-DEFECT-001`、`FE-DEFECT-004`、`FE-DEFECT-006` 的全量完成；
- 银行所有页面与全部 S0—S7 的最终验收；
- 转账状态机收敛、贷款全生命周期和银行核心全量回归；
- 视频导入、五类外部适配器、跨项目自动修复和新增高风险银行案例；
- 衡准任何页面、投影、路由迁移或写控制。

上述事项可能阻塞对应扩展功能，但不得反向阻塞 I8 的确定性作者化闭环。

## 排除范围

`HZ-OBSERVABILITY-001` 保持 `BLOCKED`。衡准不创建或编辑案例、知识、脚本、基线、调度和恢复，也不控制 Agent 平台或 Harness。仓库 `docs/` 与 `rag/` 只服务开发，产品不包含 RAG 结构。Flowise 平台知识库保存业务与操作语义；`regression_platform.sqlite` 保存结构化执行知识和回归状态；两者只传递知识快照引用，不复制正文或状态。测试环境按同源制品把 Flowise Knowledge 重建为 HiAgent Knowledge，不读取仓库开发 RAG 作为运行时回退。

## 验收依据

- [`docs/architecture/overview/coze-harness-midscene-observability-boundary.md`](../../../docs/architecture/overview/coze-harness-midscene-observability-boundary.md)
- [`docs/architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md`](../../../docs/architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md)
- [`docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md`](../../../docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md)
- [`docs/architecture/v54-coze-harness-acceptance-matrix.md`](../../../docs/architecture/v54-coze-harness-acceptance-matrix.md)
- [`docs/current-state/coze-hiagent-verification-register.md`](../../../docs/current-state/coze-hiagent-verification-register.md)
- [`contracts/openapi/test-support-api.yaml`](../../../contracts/openapi/test-support-api.yaml)

发生冲突时，实施顺序以本文件为准，任务状态以 `agent/backlog.yaml` 为准，接口以 `contracts/` 为准，当前能力以运行证据和 `docs/current-state/` 为准。
