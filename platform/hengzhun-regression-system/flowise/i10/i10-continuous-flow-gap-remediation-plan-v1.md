# I10 连续交互验收缺口修复方案 v1

> **权威同步说明（当前工作树）**：当前代码、SQLite 状态和真实运行证据决定已实现事实；工作区《衡准-I10-完整链路审计文档》决定完整链路目标设计。本文是开发控制文档，必须服从两者。本文中针对 v4 的历史缺口和旧工具数仅作为迁移背景，不得覆盖当前正式 Agentflow v5 和当前代码。

## 1. 文档定位

本文依据桌面发布目录中的实际代码、SQLite 迁移、Worker、当前正式 Agentflow v5、MCP 合同、完整链路审计文档和验收账本制定，目标是关闭：

`flowise/i10/full-human-interaction-reasoning-ledger-v1.md`

中当前未通过的连续流程缺口。

本文是后续代码修复的实施规格，不是“已经完成”的验收证明。任何阶段只有在代码、自动化测试、真实运行证据和账本连续剧本均通过后，才允许改为完成。

固定边界：

- 当前事实权威为实际代码、SQLite 状态和真实运行证据；完整链路目标权威为《衡准-I10-完整链路审计文档》。
- 正式 Agentflow v5 是派生运行制品；不得手工修改 JSON，也不得以旧 v4 说明覆盖当前代码。
- 不重新导出目录，不生成 ZIP。
- 不修改 I9 历史证书和证据。
- 不降低安全门槛，不用 Playwright 冒充 Midscene，不用 Mock 冒充真实模型。
- 控制模型保持通用 `CONTROL_*` 配置；视觉模型保持通用 `VISION_*` 配置。
- 主控模型总上下文按既定 1M 上限管理。
- 视觉模型总上下文 16K，其中输入最多 12K、输出最多 4K，并保持 Qwen3.5 兼容报文边界。
- 不自动合并、强推或移动 `main`、`coze`、`hiagent` 分支。

## 2. 复核结论

### 2.1 总体判断

账本列出的九类业务缺口成立，但根因不是九套相互独立的后端缺失，而是四类系统性问题：

1. Agentflow 生成链存在能力回退。
2. Flowise 只保存了部分状态，未编排已有后端能力。
3. 用户确认状态缺少确定性写回接口或缺少细粒度模型。
4. 异步、恢复和批量场景没有稳定、可见、可继续的出口。

因此不能通过手工编辑 `agentflow-v4.json` 逐点打补丁。必须先修复生成源，再关闭业务缺口。

### 2.2 已存在、应复用的实现

| 能力 | 当前实现 | 判断 |
|---|---|---|
| 图片受控附件提交 | `image_ingest_submit` | 已有 |
| 图片 OCR、脱敏和视觉事实提取 | `worker/src/i10-image-ingest-runner.cjs` | 已有 |
| 图片事实和模型证据存储 | 迁移 `020`、`021` | 已有 |
| 图片事实绑定 CaseDraft | `enrichDraftWithImageFacts` | 部分实现，确认模型不安全 |
| 案例文件、视频导入 | Harness、Worker、`ingest_*` | 已有基础 |
| DPAPI 凭据引用 | Harness 凭据会话 | 已有 |
| Midscene 作者化 | Worker 作者化链 | 已有 |
| 确定性 Builder | Playwright 候选生成链 | 已有 |
| 纯 Playwright 和 2×2 验证 | I10 候选链 | 已有 |
| 人工验证挑战状态机 | `verification_get`、`verification_decision_submit` | 后端已有、Flowise 未接入 |
| 执行计划修改 | `REVISE_EXECUTION_PLAN` | 后端已有、Flowise reject 未调用 |
| 旅程按 ID 查询 | `journey_get` | 已有基础 |

### 2.3 当前人工验证实现与目标增强

当前代码已实现：

```text
NONE
  -> 不创建挑战

AUTO_PERSISTED_UKEY
  -> 进入验证页
  -> 使用已持久化网页定位器执行一次网页按钮尝试
  -> 等待成功路由和业务证据

EXTERNAL_CONFIRM_REQUIRED
  -> 进入人工验证挑战
  -> 用户确认并由 Worker resume
```

完整链路审计文档要求的目标增强为：

```text
验证页
  -> Midscene 最多三次重新观察和受控网页尝试
  -> 成功则 AUTO_PASSED
  -> 三次耗尽后打开实时可见浏览器
  -> 用户接管并确认完成
  -> Worker 复核 URL / DOM / 网络 / 业务证据
  -> 判定验证类型和 Playwright 自动化可行性
```

该目标增强当前仍是开发缺口，不得在验收或发布文档中写成已实现能力。落地前必须补充尝试事件、同一 BrowserContext 接管、Flowise 状态卡、验证类型评估和真实浏览器证据。

### 2.4 最关键的生成器缺陷

当前构建链为：

```text
build-i10-agentflow.cjs
→ agentflow-v2.json
→ build-i10-agentflow-v3.cjs
→ agentflow-v3.json
→ build-i10-agentflow-v4.cjs
→ agentflow-v4.json
```

`build-i10-agentflow.cjs` 中存在图片提交、查询、等待和确认节点；但 v3 重建图时没有保留这些节点。v4 又以 v3 为输入，所以最终发布图只保留了 `supportingImages` 状态字段，没有图片真实调用路径。

该问题会让“底层已有、最终流程不可用”反复发生，属于所有业务修复的前置阻断。

## 3. 缺口编号与根因

### GAP-FND-01：Agentflow 生成源不唯一

- 影响：所有账本连续流程。
- 现象：v2 有的节点可在 v3/v4 重建时丢失。
- 根因：不同版本脚本分别重建和克隆图，没有能力清单和路径保持合同。
- 修复原则：建立一个权威生成入口；最终 JSON 只能由生成器产生，不允许手改。

### GAP-P0-01：图片未完成“提交—OCR—事实确认—草案绑定”

- 影响：R-007 至 R-011、R-065 至 R-069、R-074；F-004 至 F-006、F-009、F-012。
- 现象：最终 v4 未调用 `image_ingest_submit/get`。
- 根因一：图片节点在 v3 重建时丢失。
- 根因二：任务到达 `WAITING_USER` 后，没有 `image_ingest_decision_submit`。
- 根因三：`enrichDraftWithImageFacts` 在 `WAITING_USER` 阶段直接读取 `selected=1`，等同于把模型初选当成人工确认。
- 根因四：图片低置信度事实没有逐项确认、纠正和拒绝的追加式记录。

### GAP-P0-02：初始秘密在本地扫描前进入分类 LLM

- 影响：R-004。
- 现象：起始节点直接把 `{{question}}` 交给分类模型。
- 根因：入口没有确定性本地安全闸门；现有案例修订 guard 只覆盖后续修订。
- 重要限制：如果 Flowise 在执行节点前已把原始聊天内容持久化，单靠 Agentflow 节点无法保证 Flowise 自身数据库零明文。必须用真实存储行为验证，不得凭推测宣称解决。

### GAP-P0-03：人工验证挑战没有 Flowise 继续路径

- 影响：R-028、R-029、R-049；F-014。
- 现象：Worker 能报告并等待挑战，Harness 有两阶段决定，但 Agentflow 无查询、准备、完成、取消和恢复节点。
- 根因：验证挑战未绑定回旅程引用，Flowise 不知道当前任务已进入人工验证。

### GAP-P1-01：候选超过 45 秒没有可见出口

- 影响：R-033；F-016。
- 现象：候选等待超时被当作 MCP 错误，用户看不到“仍在处理”和继续入口。
- 根因：预期异步状态被建模为异常；Flowise 只处理 READY/FAILED 等终态。

### GAP-P1-02：初始信息缺口不能在同一旅程补齐

- 影响：R-003、R-070。
- 现象：Harness 会产生 `INITIAL_CASE_INPUT`，但 schema 和服务不接受该输入类型，Agentflow 也没有对应 Human Input。
- 根因：后端发出的输入请求和公开提交合同不一致。

### GAP-P1-03：执行计划 reject 没有回到修改

- 影响：R-042；F-018。
- 现象：最终图的 reject 直接进入“稍后处理”回复。
- 根因：Flowise 没有调用后端已经支持的 `REVISE_EXECUTION_PLAN`。

### GAP-P1-04：多案例和低置信度事实缺少逐项确认

- 影响：R-012、R-016；F-011。
- 现象：文件导入可以解析多个案例，但 Flowise 后续读取 `items.0` 或 `cases.0`。
- 根因：批量解析能力和单案例交互模型不一致；图片、视频低置信度事实也只有整批确认。

### GAP-P2-01：跨会话恢复和旧候选重新激活不足

- 影响：R-036、R-043、R-060；F-017。
- 现象：已知 journeyId 可查询，但没有未完成旅程索引，也没有由 candidateId 精确恢复到预览、下载、激活的路径。
- 根因：旅程引用没有覆盖所有下游对象，部分状态推进发生在 Flowise 外部但未同步回旅程。

### GAP-P2-02：租约、时间和完整 MCP 真实 E2E 不充分

- 影响：R-047、R-059、R-062、R-063。
- 现象：图片 claim 只领取 `lease_owner IS NULL`，过期租约未被回收；时间逻辑直接使用系统时间；当前仅证明 29 工具注册相等，不等于 29 工具真实连续 E2E。
- 根因：缺少统一租约回收策略、可控时钟和全合同运行矩阵。

## 4. 目标状态机与交互规则

### 4.1 目标连续主线

```text
用户输入
→ 本地安全闸门
→ 输入分类
→ 受控附件处理
→ 图片 OCR/视觉事实分析
→ 逐项事实确认
→ CaseDraft
→ 缺口补齐
→ 冻结案例确认
→ Midscene 作者化
→ ActionTrace
→ Builder
→ 纯 Playwright
→ 2×2 验证
→ 候选预览/下载
→ 激活或保留
→ 立即/单次/周期执行
→ 结果回读
```

所有稳定停点必须属于以下之一：

- `STATUS_ONLY`：显示处理中、完成或失败。
- `INPUT_REQUIRED`：只收集当前一个明确缺口。
- `CONFIRM_EXACT`：只确认一个冻结提案。

不存在“没有输出的中间状态”，也不存在一个 proceed 暗中选择多个业务动作。

### 4.2 图片不是第四种主输入

保持三类权威输入：

- `NATURAL_LANGUAGE`
- `CASE_FILE`
- `VIDEO`

图片是三类输入均可携带的补充证据。只有图片、没有任何案例文字时，Flowise 必须先请求一句自然语言目标，再形成：

```text
NATURAL_LANGUAGE + supportingImages
```

不在后端增加语义不完整的第四种主输入类型。

### 4.3 人工验证边界

Midscene 可以识别页面进入验证码、短信、动态令牌或 U 盾验证阶段，并暂停、说明准备事项、等待用户完成。

当前不宣称 Midscene 能自动操作：

- Windows 原生 PIN 对话框；
- 物理 U 盾按键；
- 手机收到的短信或动态验证码；
- CAPTCHA。

这些步骤由用户在被测环境中完成。除非以后新增独立、审计通过的原生设备适配器，否则不得把人工操作写成自动化成功。

## 5. 代码级修复设计

### 5.1 统一 Agentflow 生成源

修改：

- `scripts/build-i10-agentflow.cjs`
- `scripts/build-i10-agentflow-v3.cjs`
- `scripts/build-i10-agentflow-v4.cjs`
- `scripts/verify-i10-agentflow-v4.cjs`
- `flowise/i10/agentflow-v4.json`
- `flowise/i10/publication-manifest-v1.json`

实施：

1. 新增权威能力清单，最少包含：
   - `ENTRY_SECRET_GUARD`
   - `INITIAL_CASE_INPUT`
   - `SUPPORTING_IMAGE_INGEST`
   - `IMAGE_FACT_DECISION`
   - `RUNTIME_VERIFICATION`
   - `ASYNC_CANDIDATE_RESUME`
   - `EXECUTION_PLAN_REVISE`
   - `BATCH_ITEM_DECISION`
   - `CROSS_SESSION_RESUME`
2. v4 生成器不得先运行一个会丢节点的 v3 重建流程。
3. 每个能力声明必需节点、必需边、禁止边和至少一条从 start 到稳定出口的路径。
4. 生成后执行图遍历；节点存在但不可达视为失败。
5. 将当前 v4 Hash 记录为回退基线，但不得继续把它作为新图的代码源。

新增测试：

- `scripts/verification/agentflow-capability-preservation.test.cjs`
- `scripts/verification/agentflow-continuous-paths.test.cjs`

通过条件：

- 重复构建产生同一 Hash。
- 所有必需能力节点可达。
- start 不可直接连接分类 LLM。
- 不存在关键路径读取过期 `{{question}}`。
- 不存在仅有状态字段、没有工具调用路径的“伪能力”。

### 5.2 入口秘密安全闸门

修改：

- `scripts/build-i10-agentflow-v4.cjs`
- `scripts/verify-i10-agentflow-v4.cjs`
- 现有案例草案规范化和秘密扫描模块

新增一个可复用的确定性安全函数，并由入口和所有自由文本 Human Input 共用。禁止各节点复制不同正则。

输出只允许：

```text
SAFE
SECRET_BLOCKED
EMPTY_HELP
```

规则：

- 检测账号密码组合、API Key、Bearer Token、验证码、PIN、动态令牌等敏感模式。
- 命中时不进入 LLM、不进入 Harness、不进入旅程业务载荷。
- 回复只提示用户前往本机安全凭据页面，不回显命中内容。
- 附件只读取受控元数据，不读取任意本地路径。

必须先执行真实 Flowise 存储探针：

1. 用专用假秘密提交一条测试输入。
2. 检查 Flowise SQLite、日志、状态、LLM 请求证据和 Harness 数据。
3. 如果原始消息在 Agentflow 节点前已被 Flowise 持久化，则本阶段判定 No-Go。
4. No-Go 时只能采用 Flowise 支持的持久化前过滤能力；若当前版本没有该能力，必须明确“聊天框不能接收秘密”，且不能声称 Flowise 数据库零明文。

通过条件：

- 模型请求、Harness、业务 SQLite、日志、制品零假秘密。
- Flowise 自身数据库的结论由真实探针给出。
- 不能通过删除验收后的数据库来伪造零泄漏。

### 5.3 `INITIAL_CASE_INPUT` 同旅程补齐

修改：

- `harness/src/i10/schemas.ts`
- `harness/src/i10/service.ts`
- `harness/src/i10/interaction-response.ts`
- `mcp/src/server.cjs`
- `scripts/build-i10-agentflow-v4.cjs`

合同：

```text
inputKind = INITIAL_CASE_INPUT
journeyId
expectedVersion
confirmationRef
structuredInput
```

`structuredInput` 只允许当前缺口所需的白名单字段，例如：

- `caseDescription`
- `targetSystem`
- `entryUrl`
- `actions`
- `expectedOutcomes`
- `assertions`
- `credentialRef`

处理规则：

1. 与原始 `InputEnvelope` 确定性合并。
2. URL、数组长度、凭据引用和多模态绑定重新校验。
3. 仍不完整时保持同一 journeyId、生成新版本和新的单一 `inputRequest`。
4. 完整后进入案例提案，不创建新旅程。

Flowise 路径：

```text
journey_get
→ INITIAL_CASE_INPUT Human Input
→ 本地秘密 guard
→ 主控模型结构化
→ 确定性规范化
→ journey_input_submit
→ journey_get
```

### 5.4 图片事实人工决定

新增 SQLite 迁移：

- `harness/src/database/migrations/024_i10_image_fact_decisions.sql`

新增追加式表：

```text
i10_image_fact_decisions
```

最少字段：

- `decision_id`
- `image_ingest_id`
- `fact_id`
- `decision`：`CONFIRM`、`CORRECT`、`REJECT`
- `replacement_value_redacted`
- `replacement_value_hash`
- `confirmation_ref`
- `expected_job_version`
- `created_at`

不得修改既有 `i10_case_fact_candidates` 原始记录。模型输出是不可变原始证据，用户决定是覆盖层。

新增公开 MCP 工具：

```text
image_ingest_decision_submit
```

工具总数从 29 更新为 30，并同步：

- `contracts/mcp/hengzhun-i8.json`
- `mcp/src/server.cjs`
- `scripts/verification/mcp-interaction-contract.test.cjs`
- Agentflow 合同和发布清单

提交合同：

```text
imageIngestId
expectedVersion
confirmationRef
decisions[]
```

状态迁移：

```text
WAITING_USER
→ CONFIRMED
→ 可绑定 CaseDraft

WAITING_USER
→ NEEDS_CORRECTION
→ WAITING_USER

WAITING_USER
→ REJECTED
```

修改 `enrichDraftWithImageFacts`：

- 只接受 `CONFIRMED`。
- 根据事实原始记录和决定覆盖层计算有效事实。
- 不再在 `WAITING_USER` 阶段读取模型预选结果。
- `provenanceRefs` 必须保留图片、OCR 块、视觉调用和决定引用。

Flowise 路径：

```text
supportingImages 非空
→ image_ingest_submit
→ image_ingest_get
→ PROCESSING 可见等待
→ WAITING_USER 事实简报
→ proceed 确认 / reject 进入逐项修订
→ image_ingest_decision_submit
→ CONFIRMED
→ 主输入导入或 CaseDraft
```

### 5.5 多案例和低置信度逐项确认

第一步先消除静默截断：

- 当导入结果包含多个案例，而批量决定能力尚未启用时，流程必须返回 `I10_BATCH_DECISION_REQUIRED`。
- 禁止读取 `items.0` 或 `cases.0` 后假装整批完成。

新增 SQLite 迁移：

- `harness/src/database/migrations/025_i10_ingest_item_decisions.sql`

扩展既有 `ingest_decision_submit`，不新增通用文件或数据库工具。新增可选：

```text
itemDecisions[]
  ordinal
  decision = CONFIRM | CORRECT | REJECT
  expectedItemVersion
  correction
```

规则：

- 每个确认案例生成一个独立 caseId、preparationId 和后续候选。
- 部分失败不能让成功项丢失，也不能把失败项当作成功。
- 低置信度图片/视频事实必须逐项确认。
- Flowise 对大量案例采用分页摘要；用户每次只确认当前页的冻结决定。
- 每页提案带版本和 Hash，过期决定失败关闭。

### 5.6 人工验证暂停与恢复

修改：

- `harness/src/i10/service.ts`
- `harness/src/i10/interaction-response.ts`
- `worker/src/index.cjs`
- `scripts/build-i10-agentflow-v4.cjs`

现有 `verification_get` 和 `verification_decision_submit` 保持公开合同。新增的是旅程同步，不新增通用工具。

绑定：

```text
challengeId
taskId
candidateId
journeyId
actionOrdinal
```

当 Worker 报告挑战时，Harness 必须把旅程同步为：

```text
stage = AWAITING_RUNTIME_VERIFICATION
status = AWAITING_USER
references.challengeId = ...
```

Flowise 两阶段交互：

1. 准备阶段：
   - proceed：`USER_READY`
   - reject：`CANCEL`
2. 操作完成阶段：
   - proceed：`USER_ACTION_COMPLETED`
   - reject：`CANCEL`

提示必须明确：

- 验证内容不要输入 Flowise。
- 用户应在被测页面、手机或物理设备上完成。
- proceed 只表示“已准备”或“已完成”，不是提交验证码。

恢复要求：

- Worker 保持同一 taskId。
- `verification:resume` 只成功一次。
- 重复点击幂等或返回明确版本冲突。
- 过期、取消和设备不可用进入可解释终态。

### 5.7 异步候选可见出口

修改：

- `mcp/src/server.cjs`
- 候选等待/查询响应
- `scripts/build-i10-agentflow-v4.cjs`

预期长任务不再把 45 秒当作协议失败。推荐改为短查询：

```text
candidate_get(waitForCertificate=false)
```

返回：

```text
PROCESSING
READY
FAILED
```

`PROCESSING` 必须包含：

- `preparationId`
- `journeyId`
- `retryAfterSeconds`
- `lastActivityAt`
- `progressSummary`

Flowise：

```text
PROCESSING → 状态简报 + “继续查询”入口
READY      → 候选预览/下载
FAILED     → 失败分类和允许的后续动作
```

用户“继续”只查询，不重新编译、不重复提交任务。

### 5.8 执行计划 reject 返回修改

修改：

- `scripts/build-i10-agentflow-v4.cjs`
- 相关 Journey 决定绑定

最终确认的 reject 必须调用：

```text
journey_decision_submit
decision = REVISE_EXECUTION_PLAN
```

然后回到同一个执行计划 Human Input。

“暂不执行”不能复用 reject。若需要该行为，应先生成唯一的 `DEFER_EXECUTION` 提案，再由用户单独确认。

普通脚本和修复脚本的调度使用同一套：

```text
输入
→ 规范化
→ 冻结计划
→ proceed/reject
```

禁止读取全局旧 `{{question}}`。

### 5.9 跨会话恢复和旧候选重新激活

扩展现有 `journey_get` 的安全查询方式，不优先增加新工具：

```text
journeyId
或 candidateId
或 preparationId
```

要求：

- 查询只能在同一 namespace。
- 一个引用只能解析到一个旅程，否则失败关闭。
- 旅程引用在 candidate、task、schedule、repair 等状态推进时持续同步。
- 新会话可恢复到最后一个稳定停点。
- 旧下载授权过期后重新签发短时授权，但文件 Hash 不变。
- 激活仍需新的冻结提案和人工确认，不能凭旧 proceed 自动激活。

### 5.10 租约、时间和全工具矩阵

修改：

- `harness/src/i10/service.ts`
- Worker claim 实现
- 调度和验证过期判断
- MCP 合同测试

租约：

- claim 查询必须同时允许未领取任务和已过期租约。
- 回收操作在事务中完成。
- 旧 worker 完成回传因所有权不匹配而失败。
- 记录重试次数和最后错误；超过上限进入明确失败状态。

时间：

- 引入可注入 `Clock`。
- 生产默认系统 UTC 时钟。
- 单元测试使用固定、推进和跳跃时钟。
- 覆盖时区、夏令时、错过执行、过期确认和重启恢复。

MCP：

- 工具数更新为 30。
- 每个工具至少包含成功、合同失败、权限失败、版本冲突和幂等重放。
- 真实 E2E 证据必须记录非 Mock、非 degraded、数据库状态和返回引用。

## 6. 实施阶段

### S0：冻结基线并统一生成器

交付：

- 当前 v4、MCP 合同和发布清单 Hash 基线。
- 权威 Agentflow 能力清单。
- 唯一构建入口。
- 能力保持和连续路径测试。

Go 条件：

- 构建可重复。
- 当前已支持主线不回退。
- 图片等能力不会再因版本重建丢失。

### S1：入口安全和同旅程补齐

关闭：

- GAP-P0-02
- GAP-P1-02

交付：

- 入口秘密 guard。
- Flowise 原始消息持久化探针结论。
- `INITIAL_CASE_INPUT` 合同、服务和 Flowise 路径。

Go 条件：

- 不完整输入不会提交业务 MCP。
- 同一 journeyId 可以多轮补齐。
- 不能证明零泄漏时明确 No-Go，不改写为通过。

### S2：图片闭环

关闭：

- GAP-P0-01

交付：

- 迁移 024。
- `image_ingest_decision_submit`。
- 图片 Flowise 节点。
- 事实逐项确认和有效事实覆盖层。

Go 条件：

- 自然语言、文件、视频三入口均能携带图片。
- 中英文 OCR、视觉事实、人工确认、CaseDraft 绑定和溯源全部可见。
- 未确认图片事实不能进入正式案例。

### S3：批量和低置信度确认

关闭：

- GAP-P1-04

交付：

- 迁移 025。
- 批量决定合同。
- 分页、逐项决定和独立 preparation。

Go 条件：

- 不再存在 `items.0/cases.0` 静默截断。
- 2 项和 1000 项边界测试通过。

### S4：人工验证暂停与恢复

关闭：

- GAP-P0-03

交付：

- challenge 与 journey 绑定。
- Flowise 两阶段 Human Input。
- 同任务一次性恢复。

Go 条件：

- 验证挑战能真实暂停。
- 用户在外部完成后恢复同一 taskId。
- 不在对话中收集验证码、PIN 或 U 盾秘密。

### S5：异步候选和跨会话恢复

关闭：

- GAP-P1-01
- GAP-P2-01

交付：

- PROCESSING 稳定出口。
- 继续查询。
- 引用索引和新会话恢复。

Go 条件：

- 超过 45 秒不会显示协议错误。
- 查询不会重复编译。
- 新会话可从精确稳定停点继续。

### S6：执行计划修改闭环

关闭：

- GAP-P1-03

交付：

- reject 调用 `REVISE_EXECUTION_PLAN`。
- 普通和修复调度共用修改流程。

Go 条件：

- reject 后同旅程重填。
- 二次冻结并确认后才创建调度。

### S7：租约、时间和 30 工具矩阵

关闭：

- GAP-P2-02

交付：

- 过期租约回收。
- 可控时钟。
- 30 工具合同和真实运行矩阵。

Go 条件：

- 故障注入不会永久卡住任务。
- 时间边界可重复验证。
- 注册数量、合同数量、Flowise 数量和运行数量均为 30。

### S8：连续人类交互验收与账本收口

执行账本中的连续组合，而不是只验证离散节点：

1. 自然语言，无图片，完整信息。
2. 自然语言，信息缺失，多轮补齐。
3. 自然语言加图片，事实确认和修订。
4. 案例文件加图片，单案例。
5. 案例文件加图片，多案例、部分拒绝。
6. 视频加图片，OCR 低置信度修订。
7. Midscene 正常作者化。
8. 人工验证暂停、准备、完成、恢复。
9. 候选超过 45 秒后继续查询。
10. 下载后不激活，再在新会话恢复并激活。
11. 激活后立即执行。
12. 单次计划 reject、修改、二次确认、执行。
13. 周期计划创建、触发、停用。
14. 定位器失效、修复候选、2×2、激活、复跑。
15. 进程中断、租约过期、服务重启、旅程继续。

每条连续剧本必须保存：

- 用户可见对话转录。
- Flowise 节点轨迹。
- MCP 调用序列。
- journeyId、caseId、preparationId、candidateId、taskId 或 scheduleId。
- SQLite 状态迁移。
- 脱敏证据和 Hash。
- 最终通过、失败或阻断原因。

## 7. 测试矩阵

### 7.1 静态测试

- Agentflow 所有节点可达。
- start 到 LLM 之间必须经过秘密 guard。
- 关键路径不读取旧 `{{question}}`。
- Human Input 的 proceed/reject 均有唯一语义。
- 禁止 `items.0/cases.0` 静默截断。
- MCP、Flowise、发布清单工具数一致。

### 7.2 Harness 和 SQLite

- `INITIAL_CASE_INPUT` 多轮补齐。
- 图片事实覆盖层、版本冲突、幂等。
- 多案例逐项决定。
- challenge 两阶段决定和一次性恢复。
- 旅程按引用恢复。
- 过期租约回收和旧 owner 拒绝。
- 固定时钟和跳时钟。

### 7.3 Worker

- 图片 OCR 中英文。
- 控制模型图片事实提取。
- MiMo 16K/12K/4K 限制。
- 视觉失败关闭。
- 人工验证暂停。
- 服务重启后的租约恢复。

### 7.4 Flowise 连续 E2E

- 三主入口与图片附件的排列组合。
- 缺口输入和拒绝修改。
- 候选异步等待。
- 激活和不激活。
- 立即、单次、周期。
- 反向修复。
- 跨会话恢复。

### 7.5 安全

扫描范围：

- Flowise 数据库和日志。
- Harness SQLite 和日志。
- Worker 日志。
- MCP 日志。
- ActionTrace、截图、视频帧。
- Playwright 源码和下载制品。
- 发布目录和 Hash 清单。

使用专用假秘密，不使用真实账号、密码或 API Key。

## 8. 缺口—阶段—验收映射

| 缺口 | 阶段 | 主要验收记录 |
|---|---|---|
| GAP-FND-01 | S0 | 所有 F-001 至 F-024 的路径保持 |
| GAP-P0-01 | S2 | R-007..011、R-065..069、R-074；F-004..006、F-009、F-012 |
| GAP-P0-02 | S1 | R-004 |
| GAP-P0-03 | S4 | R-028、R-029、R-049；F-014 |
| GAP-P1-01 | S5 | R-033；F-016 |
| GAP-P1-02 | S1 | R-003、R-070 |
| GAP-P1-03 | S6 | R-042；F-018 |
| GAP-P1-04 | S3 | R-012、R-016；F-011 |
| GAP-P2-01 | S5 | R-036、R-043、R-060；F-017 |
| GAP-P2-02 | S7 | R-047、R-059、R-062、R-063 |

## 9. 完成门槛

本方案只有同时满足以下条件才能关闭：

- 九类账本缺口均有实现、测试和真实连续流程证据。
- Agentflow 从唯一生成源产生，发布 API 回读 Hash 一致。
- 三类输入均可携带图片并形成同一 CaseDraft 合同。
- 未确认的模型事实不能进入正式案例。
- 人工验证可暂停和恢复同一任务。
- 候选长时间处理有可见、可继续出口。
- 多案例不再静默只处理第一项。
- 执行计划 reject 返回修改。
- 新会话能精确恢复未完成旅程和旧候选。
- 过期租约可安全回收，时间行为可重复测试。
- 30 个 MCP 工具注册、合同、Flowise 和真实运行证据一致。
- 敏感内容扫描满足实际可证明的边界；无法证明 Flowise 原始消息零持久化时不得作出该主张。
- 完整 `VERIFY.cmd --no-pause` 返回 `I10_PORTABLE_FOLDER_VERIFIED`。

## 10. 风险与禁止事项

### 10.1 主要风险

- 修改 Flowise 图时再次丢失旧能力。
- 新增工具后漏更新合同、校验器或发布清单。
- 把模型预选事实误当用户确认。
- 把异步处理中误报为失败。
- 为了“自动化”而虚构 U 盾、验证码自动操作能力。
- 只跑离散单元测试，没有跑连续人类对话。

### 10.2 明确禁止

- 手工改最终 JSON 而不同步生成器。
- 在 `WAITING_USER` 状态直接绑定图片事实。
- 在聊天框收集账号、密码、验证码、PIN 或 API Key。
- 用固定 sleep 代替状态查询。
- 超时后重复提交 compile/run。
- 多案例只取第一项。
- 用清理数据库的方法制造零泄漏结果。
- 用 Playwright 定位成功冒充 Midscene 视觉成功。
- 用已通过的 I9 六次证书认证新的 I10 候选。

## 11. 推荐执行顺序

严格按：

```text
S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
```

S0 未通过时不进入业务修复；否则后续修改仍可能被生成器覆盖。

P0 未全部通过时，不进入“平台可完整使用”的结论。P1 未全部通过时，不进入真实用户连续验收。P2 和 S8 未通过时，不进入正式版完成结论。
