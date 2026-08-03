# I10 一般最终标准化升级方案 v2

状态：`PLANNED_FROM_CURRENT_CODE`  
范围：L1—L3、M1—M3、H1—H3 的双路径（文本 / 文本加截图 OCR）链路；其中 L1—L3 与 H1—H3 为本轮重点。  
权威顺序：当前源码与迁移 → 当前 Harness/Worker 运行态 → Flowise 公共 API 发布回读 → 当前验收账本 → 本文档与历史汇报。

## 1. 当前事实与结论

2026-07-31 对当前桌面包的核对结果：

| 项目 | 当前事实 | 不能据此得出的结论 |
|---|---|---|
| Agentflow | v7 已由 `scripts/build-i10-agentflow-v7.cjs` 生成；清单为 `BUILT_NOT_PUBLISHED` / `deployed=false`。 | 不能称当前聊天运行 v7，也不能称人工交互缺陷已消失。 |
| 运行就绪 | Harness 健康接口报告迁移 036 已就绪、Worker 代码版本一致；Agentflow 状态为 `NOT_PUBLISHED`，总状态 `degraded`。 | 不能称业务运行就绪。 |
| 静态验证 | `npm run test:i10:journey` 当前通过 208 项；v7 图与最终标准化预检通过。 | 不能替代模型、Flowise、Midscene、浏览器或收件箱 E2E。 |
| 验收账本 | `acceptance-ledger-v3` 为 0/18，所有 L/M/H 双路径均 `PENDING_PAIR`。 | 不能标记 `I10_FLOWISE_18_CHAIN_ACCEPTED` 或 `I10_FLOWISE_LOCAL_ACCEPTED`。 |
| U 盾策略 | Worker 已具备“明确验证路由 → 三次观察/定位 → Playwright 点击 → 业务证据”的代码路径。 | 未完成本机真实转账验证页、直达单号页、可见接管三分支证据。 |

本方案的目标不是承诺“以后绝不出现任何失败”。可工程化承诺是：**同一冻结输入重复运行不会重复写入、不会借用旧证据、不会因为旧中间态误判成功；可恢复的中断从可验证检查点继续，不可恢复的漂移失败关闭并给出唯一恢复动作。**

## 2. 统一最终标准

### 2.1 版本与身份标准 `ReleaseIdentityV2`

每一个从 Flowise 开始的链路在首个写操作前冻结：

```text
releaseIdentity = {
  sourceFlowHash, deployedFlowHash, normalizedFlowHash,
  flowVersion, harnessCodeHash, workerCodeHash,
  migrationVersion, caseCatalogHash, identityHash
}
```

规则：

1. 仅当 v7 源图、Flowise 公共 API 回读图、发布清单三者的规范化 Hash 相同，才允许写入 `deployed=true`。
2. 任一服务重启、迁移、代码或图 Hash 改变，都使未终态的验收尝试进入 `RELEASE_IDENTITY_STALE`；不得用旧尝试补齐新版本账本。
3. 每条验收记录携带完整 `releaseIdentity`，证书、脚本、激活、执行和收件箱引用必须属于同一身份。
4. `VERIFY.cmd` 只能证明文件完整；不得写入任何业务验收状态。

### 2.2 统一输入标准 `TypedBusinessInputsV1`

所有 L/M/H 案例先转换为同一 `CaseDraft`，再附加类型化业务输入：

```text
TypedBusinessInputsV1 = {
  caseClass: LOW | MEDIUM | HIGH,
  values: {
    dateRange?, filter?, payeeRef?, amount?, currency?, purpose?
  },
  source: USER_CONFIRMED | IMPORT_CONFIRMED | OCR_CONFIRMED,
  inputHash
}
```

输入规则：

| 类别 | 必填的非秘密输入 | 禁止行为 |
|---|---|---|
| L1—L3 | 无；仅 `credentialRef` 与入口地址 | 不把页面定位器、账号或密码列成用户缺口。 |
| M1 | `dateRange`、`filter` | 不从动作文字臆测日期或筛选值。 |
| M2—M3 | `filter` | 不把空筛选解释成“查询全部”。 |
| H1—H3 | `payeeRef`、`amount`、`currency`、`purpose` | 不从自然语言正则或 OCR 片段自动补金额、用途或收款人。 |

`credentialRef` 始终由 DPAPI 本机表单注入。LLM 可判断“业务信息是否完整”，但不能生成、替换或看到凭据值。OCR 只输出候选事实，必须经用户确认后才写入 `TypedBusinessInputsV1`。

### 2.3 可重跑标准 `AttemptReplayV1`

每条链路使用：

```text
attemptKey = sha256(releaseIdentity.identityHash + caseId + inputHash + pathKind)
pathKind = TEXT | OCR_ATTACHMENT
```

状态机：

```text
CREATED → INPUT_CONFIRMED → TARGET_FROZEN → AUTHORING_SUBMITTED
→ CANDIDATE_READY → PLAYWRIGHT_PASSED → CERTIFIED_2X2
→ ACTIVATION_DECIDED → RUN_SUBMITTED → INBOX_TERMINAL
```

补充状态：`INTERRUPTED_RECOVERABLE`、`FAILED_CLOSED`、`RELEASE_IDENTITY_STALE`、`SUPERSEDED`。

硬性规则：

1. 每个状态转换都必须带前一版本、幂等键、冻结载荷 Hash 和唯一产物引用。
2. 重试只读取 Harness 的 `Journey / Preparation / Candidate / Certificate / Task / Run / Inbox` 当前状态；禁止通过 Flowise 历史文本猜测进度。
3. 同一 `attemptKey` 的写操作返回原始结果或 `ALREADY_APPLIED`，不新建候选、证书、调度或正式运行。
4. 代码、目标档案、凭据引用、输入 Hash、脚本 Hash 或证书 Hash 任一漂移时，旧检查点失效；必须创建新尝试。
5. `FAILED_CLOSED` 只允许显式的“修订候选”或“从输入重新开始”，不允许 `proceed` 隐式重试。

## 3. 分级案例的最终合同

### 3.1 L1—L3：低风险、无验证挑战

| 案例 | 业务前置 | 最低验证 | 反向故障注入 |
|---|---|---|---|
| L1 客户资料 | 可登录客户、主页与资料页 | 姓名一致、头像元素可见、截图证据 | 更改资料页定位器；必须形成修复候选而非重建案例。 |
| L2 账户概览 | 账户摘要夹具 | 余额/账户掩码/状态的只读区域可见 | 列表加载超时；必须在任务结果中区分页面加载与定位失败。 |
| L3 消息摘要 | 幂等未读消息夹具 | 至少一条消息、状态、时间或摘要可见 | 夹具为空；必须被预检标为 `FIXTURE_PRECONDITION_FAILED`，不得进入作者化。 |

L 类统一 `verificationPolicy=NONE`。任何页面静态“移动证书/U 盾/验证码”文案都不得创建挑战。

### 3.2 M1—M3：中风险、类型化查询输入

| 案例 | 类型化输入 | 最低验证 | 重跑保护 |
|---|---|---|---|
| M1 交易筛选 | `dateRange`、`filter` | 结果集满足日期/类型过滤，并有空结果分支断言 | 相同输入只能复用同一筛选计划；不写入重复交易。 |
| M2 收款人查询 | `filter` | 名称、掩码账号、状态均属于同一条目 | 查询词变更即新 `inputHash`，不得复用旧截图事实。 |
| M3 文档查询 | `filter` | 文档条目/状态/下载入口的存在性，不强制下载 | 未声明下载时不得由 Builder 虚构下载点击。 |

M 类统一 `verificationPolicy=NONE`。筛选、查询、下载等动作必须在确认后的 `TypedBusinessInputsV1` 中有来源，Builder 禁止从自然语言动作正则提取关键值。

### 3.3 H1—H3：高风险、转账与 U 盾分支

H1/H2/H3 共享输入：`payeeRef`、正数 `amount`、ISO/项目允许的 `currency`、非空 `purpose`。所有值来自冻结的 `TypedBusinessInputsV1`，而不是 `explicitTransferFixtureValue()` 的自然语言正则回退。

```text
填写转账信息
→ 首次确认
→ [已到 /portal/orders/query]：AUTO_PASSED
  [到 /portal/verification]：三次独立视觉观察
      → Playwright 点击网页“确认验证”
      → 路由 + DOM + 单号三项证据
      → 成功：进入单号查询
      → 三次失败：仅在可见 BrowserContext 可接管时创建人工挑战
      → 不可接管：I10_VISIBLE_BROWSER_HANDOFF_UNAVAILABLE
→ 单号查询及业务字段核对
```

约束：

- Midscene 仅观察和返回定位/置信度/页面指纹；Playwright 是唯一点击、填写、断言和截图执行者。
- 三次尝试必须分别保存截图摘要、页面指纹、定位结果、点击结果和后置证据；相同任务/动作/页面指纹不得重复创建挑战。
- 不自动操作原生 U 盾、PIN、OTP、验证码或系统窗口。持久化网页确认按钮可以自动点击。
- H1 证实首次确认路由；H2 证实验证分支；H3 证实单号页与业务字段。三者不得以同一截图/单号互相代替。

## 4. 代码级升级批次

### FS-01：发布身份与账本收敛（P0）

修改：

- 将 `scripts/i10-release-identity.cjs` 扩展到 `ReleaseIdentityV2`，纳入部署图 Hash、迁移和 Worker 版本。
- `scripts/i10-acceptance-ledger-v3.cjs` 的每条记录写入 `attemptKey`、输入/部署身份、所有状态转换与终态产物；旧 v2/v3 历史记录只能显示 `HISTORICAL_STALE`。
- `scripts/i10-agentflow-publish.cjs`、`scripts/start-i10.ps1`、`scripts/i9-lifecycle.cjs` 同时校验发布清单、公共 API 和健康端点；任一不一致停止启动/验收。
- `scripts/i10-18-chain-acceptance-live.cjs` 改为从任一有效检查点恢复，不能只恢复终态摘要。

验收：发布 v7 后，运行图节点/边/规范化 Hash 与源图完全一致；服务重启或图变更后旧检查点不能继续写入。

### FS-02：类型化业务输入替代文本解析（P0）

修改：

- 在 `harness/src/i10/schemas.ts`、`harness/src/schemas.ts`、`harness/src/i8/stage2-schemas.ts` 增加 `TypedBusinessInputsV1`。
- `scripts/i10-case-draft-normalizer.cjs` 只负责产生“待确认字段”；确认后的数据由 `journey_input_submit` 持久化为类型化对象。
- `harness/src/i8/script-package-builder.ts` 改为仅消费计划中的 `typedBusinessInputs`；保留 `explicitTransferFixtureValue` 仅供旧 I9 回放，且新 I10 路径遇到它即失败 `I10_TYPED_BUSINESS_INPUT_REQUIRED`。
- Flowise v8（以 v7 为回退）在输入收集、输入确认、冻结提案之间增加“业务字段回显”节点；禁止模型或 OCR 自动写入 H 类金额/用途/收款人。

验收：H1—H3 缺任何一个字段均在作者化之前返回具体字段；四项齐全时 Builder 不再读取动作字符串。

### FS-03：被测系统预检与夹具标准化（P0）

修改：

- 为每个 L/M/H 夹具建立 `ScenarioReadinessV1`：版本、主体、创建时间、幂等键、预期 UI/API 可观察结果。
- 所有链路在 Flowise 写操作前调用只读 `scenario_preflight`；L3 空消息、M1 空交易、M2 空收款人、H 类无收款人/验证页/单号页均在这里失败关闭。
- 场景初始化仅通过 `local/test` 支持接口；不得改写 Fineract、Keycloak 或 Flowise 数据库制造证据。
- 每个场景使用隔离端口、命名空间和清理标识；不停止未知门户进程。

验收：重复 provision 不重复写入，缺夹具显示唯一预检错误，不进入 Midscene/Playwright。

### FS-04：验证策略与恢复闭环（P0）

修改：

- 以 `i10_verification_attempts` 不可变表为唯一三次尝试证据，增加任务/动作/页面指纹唯一性及后置业务证据字段。
- `worker/src/i10-verification-execution.cjs` 为每次尝试追加路由、DOM、单号/业务证据判定，不得仅以 URL 或点击成功判定通过。
- 人工接管从任务启动时创建可恢复 headful BrowserContext；无交互桌面返回明确错误，不能显示不可操作的 Flowise 人工确认。
- 验证恢复后必须重新检查页面状态；未变化写 `I10_VERIFICATION_NOT_RESOLVED` 并结束当前动作。

验收：登录案例零挑战；H 类覆盖直达单号、网页自动确认、三次失败/可见接管三分支，并能重新启动后从挑战状态恢复。

### FS-05：Flowise v8 输入与长任务交互（P1）

修改：

- v8 继续单 Start 节点；每次 Flowise 执行最多一个变更状态 MCP 调用，其余通过 Harness Journey 转换投影。
- 统一 `INPUT_REQUIRED` / `CONFIRM_EXACT` / `STATUS_ONLY`；反馈信息必须填入 Human Input 的 `feedback` 后点击 `proceed`，拒绝语义由当前阶段限定。
- 所有 LLM 节点输入使用 `controllerPromptEnvelopeV2`：当前输入、已确认草案摘要、最多 32 条 OCR 事实、精确缺口和输入版本；禁止带完整历史、原始 JSON 或凭据。
- 长作者化/2×2/调度只返回任务引用与进度，终态从 `task_get` / `result_inbox_list` 回读；不得同步等待。
- 对话只显示“状态、唯一缺口、下一步、制品链接”；CaseDraft、诊断、ActionTrace、OCR 明细以可下载 Artifact 提供。

验收：URL 补充、凭据回流、OCR 确认、H 类输入、目标档案确认均不会丢失已冻结字段或重新发起全量 LLM 结构化；LLM 中断后发送“继续”从同一 Journey 恢复。

### FS-06：反向修复、调度与验收矩阵（P1）

修改：

- 修复候选以失败诊断 Artifact 为唯一输入：失败阶段、动作序号、页面指纹、定位/模型状态、可修复范围。
- 修订脚本必须 Builder 规范化 → 纯 Playwright → I10 2×2 → 用户确认 → 激活 → 单次复跑；任一步失败保留原激活版本。
- 调度使用已持证并已激活的脚本；ON_DEMAND、ONE_TIME、RECURRING 分别验证时区、错过执行、幂等、停用、重启恢复和收件箱归属。
- 双路径验收按每案例同一 `semanticContractHash` 比较：OCR 可增加已确认页面事实，不能改变目标、关键输入、验证策略或预期业务结果。

验收：定位器故障注入形成真实修复闭环；三种调度均有当前版本收件箱/运行/产物证据；18 条都写入独立终态记录。

## 5. 正向与反向验收矩阵

每个 L1—H3 均运行 `TEXT` 和 `OCR_ATTACHMENT` 两次；共 18 条。每条必须按下列门槛逐项写入检查点：

```text
P0  ScenarioReadinessV1 通过
P1  输入、credentialRef、TargetProfile 与 CaseDraft 冻结
P2  Midscene 定位证据 + Playwright 生成候选
P3  纯 Playwright + 2×2 证书
P4  用户激活 / 不激活决策
P5  按案例类别的 ON_DEMAND / ONE_TIME / RECURRING 执行
P6  Task、Run、Inbox、Artifact 一致的终态回读
```

反向矩阵至少包括：

| 注入点 | 预期结果 | 禁止结果 |
|---|---|---|
| 缺业务输入 | 输入门槛给出单一字段缺口 | 调用作者化或从文本猜值。 |
| 夹具不就绪 | `FIXTURE_PRECONDITION_FAILED` | 把业务空态误报为模型/定位失败。 |
| Midscene 定位失败 | 诊断 Artifact + 受控修复候选 | 泛化 `I8_CANDIDATE_BUILD_FAILED`。 |
| U 盾三次失败 | 可见接管或明确不可接管错误 | 静态页面文案触发循环。 |
| Worker/模型中断 | `INTERRUPTED_RECOVERABLE`，再入恢复 | 重复创建候选、证书或调度。 |
| 代码/图/迁移变更 | `RELEASE_IDENTITY_STALE` | 旧账本或旧证书认证新运行。 |
| OCR 与文字冲突 | 人工确认或失败关闭 | OCR 改写原始业务意图。 |

## 6. 最终完成门槛

## 6.1 本轮代码落地状态（2026-07-31）

本轮只将可由静态和本机合同验证的 P0 重跑风险收口；没有把未运行的
Flowise/Midscene/浏览器链路标记为通过。

- 已落地：`TypedBusinessInputsV1` 贯通 CaseDraft、I10 作者化服务、
  IntentPlan 与 Builder。H1—H3 只有在 `payeeRef`、`amount`、`currency`、
  `purpose` 全部已确认时才可进入作者化；I9 旧计划仍走隔离的 `LEGACY`
  回放兼容路径。
- 已落地：验收账本的终态记录按发布身份不可覆盖；再次启动相同案例/变体
  将复用同一终态证据，而不是创建第二个候选、证书、调度或转账。
- 已落地：v7 生成器明确请求结构化 `businessInputs`，并把案例结构化节点
  收紧为 2K 输出上限；全局模型上限仍保持产品配置的 8K，不被此节点放大。
- 已验证：TypeScript 构建、Agentflow v7 构建/静态校验、I10 Journey 全量
  211 项合同测试及包完整性校验均通过。
- 未完成：v7 尚未经 Flowise 公共 API 发布，18 条真实链路账本仍为 `0/18`；
  因此不得授予 `I10_FLOWISE_18_CHAIN_ACCEPTED` 或
  `I10_FLOWISE_LOCAL_ACCEPTED`。

仅在同时满足以下条件后，允许写入 `I10_FLOWISE_LOCAL_ACCEPTED`：

1. v8（或最终指定版本）已通过公共 API 发布，源图/部署图/清单 Hash 一致；当前服务均由该版本启动。
2. L1—H3 文本与 OCR 两路径全部完成 P0—P6，账本为 18/18，且每条包含同一版本的脚本 Hash、2×2 证书、激活决策、运行和收件箱证据。
3. L3、M1、M2、H1—H3 的场景夹具已真实预检；H 类三种 U 盾分支均有独立证据。
4. 至少一条反向修复链形成“失败 → 诊断 → 修复候选 → 2×2 → 确认 → 复跑”闭环。
5. 所有测试入口都存在、全量测试通过、敏感信息扫描为零，`VERIFY.cmd --no-pause` 输出 `I10_PORTABLE_FOLDER_VERIFIED`。

在此之前，正确状态只能是：**代码/合同预检通过，运行验收进行中；不得把局部 L1 或历史 PASS 表述为 18 链验收完成。**
