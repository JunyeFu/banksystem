---
id: DOC-CONTROL-TECHNICAL-REGISTER-001
title: 衡准技术控制登记册与多轮变更协议
document_type: how-to
domain: governance
status: accepted
authority: normative
version: 1.3
effective_date: 2026-07-20
owner: project-owner
---

# 衡准技术控制登记册与多轮变更协议

> 本文保存多轮对话中不可丢失的技术约束、追踪编号、审计结论和控制文档更新事务。它不拥有项目排期或任务状态；任何“先做/后做”只引用唯一实施顺序，任何 `READY/DONE` 只引用 Backlog。

## 1. 权威链

| 优先级 | 权威 | 负责内容 | 禁止内容 |
|---:|---|---|---|
| 1 | 运行证据、测试、契约、源码 | 当前真实行为 | 用目标设计冒充实现 |
| 2 | `AGENTS.md` | 稳定仓库边界与安全规则 | 易变进度百分比 |
| 3 | 唯一实施顺序 | 全局阶段、先后、入口和退出 | 复制任务状态 |
| 4 | `agent/backlog.yaml` | 状态、依赖、允许路径、验收 | 建立另一套阶段编号 |
| 5 | 当前架构基线、Accepted ADR/决策 | 系统边界和取舍 | 声称已经实现 |
| 6 | I8 实施规格、`contracts/` | 对象、Schema、状态机、DSL、MCP、测试 | 改写项目级先后 |
| 7 | 能力矩阵、证据 | 已证明/未证明状态 | 用历史证据证明新平台 |
| 8 | 调研、历史、正式文书 | 背景和外部依据 | 覆盖以上权威 |

关键入口：

- [简明控制卡](collaboration-brief.md)
- [唯一实施顺序](../../agent/plans/active/v54-implementation-batches.md)
- [任务状态源](../../agent/backlog.yaml)
- [Flowise/SQLite/HiAgent 架构基线](../architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md)
- [I8 实施规格](../design/regression-platform/i8-deterministic-authoring-spec-v1.md)
- [当前能力矩阵](../current-state/capability-matrix.md)

## 2. 本轮控制文档审计结论

### 2.1 已正确保留

- Flowise 替换 Coze 作为个人/办公电脑入口，HiAgent 作为测试环境目标。
- HiAgent 已证明能力交集优先，Flowise 本机成功不能冒充 HiAgent 成功。
- Agent 与本地工具职责分离，平台外调用只走 MCP。
- Flowise 平台知识、Flowise SQLite、Harness SQLite 的权威边界和禁止双写。
- 仓库 RAG 只用于开发，产品不建设 RAG 子系统。
- Midscene/Playwright/Builder 的职责分离、三段动作上下文、正式回归无 LLM。
- 自然语言输入、用户激活、精确版本调度、离线结果收件箱和限域反向修复。

### 2.2 已修复的冲突

| 审计 ID | 原问题 | 修复 |
|---|---|---|
| `AUD-001` | 顶层 `AGENTS.md` 仍把 Coze/Coze Knowledge 写成当前入口和知识权威 | 改为 I0-I7 历史、I8 Flowise 当前、HiAgent 目标 |
| `AUD-002` | 能力矩阵把当前未生成的开发 RAG 索引写成已验证 | 改为 `NOT_BUILT / DEVELOPMENT_ONLY` |
| `AUD-003` | 架构索引把已替代 V5.4/Coze 基线称为当前 | 改为历史基线和历史验收矩阵 |
| `AUD-004` | “连续 3 次、2 视口”可能理解为总共 3 次或 6 次 | 固定为每视口 3 次，共 6 次 |
| `AUD-005` | 动作上下文和工具输出预算都使用 L1/L2/L3 | 分别命名 `CTX-Lx` 与 `OUT-Lx` |
| `AUD-006` | 4 KiB 分级机制未完整进入 I8 当前规格 | 固定四级默认值、上限和 128 KiB 硬上限 |
| `AUD-007` | 视频和外部案例被列为非目标，容易被理解为取消 | 标为 I8 后延期需求，并建立 Backlog 项 |
| `AUD-008` | “任意电脑可传播”缺少受支持系统边界 | 固定为 Windows 10/11 x64 解压即用，不承诺其他 OS/CPU |

### 2.3 滑动上下文实现审计

| 审计 ID | 当前证据 | 结论与控制动作 |
|---|---|---|
| `AUD-009` | Harness `claimNextAuthoringAction` 从 SQLite 维护完整计划、游标、上一摘要、当前动作、下一预览、最近事实和页面状态 | `CLOSED_STAGE1`：保留历史机械层，但对 Worker 只发当前获批 CTX Envelope，不再用宽松 `window` 作为执行契约 |
| `AUD-010` | 历史 Worker 只读取 `currentAction.prompt` | `CLOSED_STAGE1`：Worker 解析严格 Envelope，模型提示包含完整获批 Envelope；纯 Playwright 路径不调用模型并记录 `NOT_INVOKED` |
| `AUD-011` | 历史代码缺少 CTX 升级、token/图像估算、预算错误码和 migration 009 | `CLOSED_STAGE1_CODE`：已实现 L1→L2→L3、视觉16K/12K、主控1M预算函数、图像预估、确定性错误码和不可变审计；Flowise 主控实际调用留待阶段2 |
| `AUD-012` | 历史 authoring claim 响应为任意对象 | `CLOSED_STAGE1`：Worker OpenAPI 1.3.0 冻结 Claim、Envelope、Completion 与 usage Schema，顶层及受控嵌套对象均拒绝未知字段 |
| `AUD-013` | 历史 `test:i4` 只证明机械层 | `CLOSED_STAGE1_AUTOMATION`：`verify:i8:stage1` 9/9 覆盖 Schema、migration、CTX升级、预算、实际usage超限和OpenAPI；真实 MiMo/Flowise E2E 仍未运行 |
| `AUD-014` | 普通用户输入可能混入 namespace、幂等键、凭据别名等技术参数 | `CLOSED_STAGE2`：Agentflow Start 固定为单一 Chat Input；MCP 从会话和受控环境生成 namespace、幂等键、actor 与鉴权参数 |
| `AUD-015` | Flowise 可能通过 HTTP/Code/SQLite 绕过 MCP | `CLOSED_STAGE2`：Agentflow 制品和自动测试拒绝 Code/HTTP/数据库/文件/Shell 节点，外部工具节点只允许 `customMCP` |
| `AUD-016` | MCP 全量工具若提前暴露会伪造后续阶段能力 | `CLOSED_STAGE2`：14工具名称冻结，只有3项阶段2工具 ACTIVE；其余11项稳定返回 `I8_STAGE_CAPABILITY_NOT_AVAILABLE` |
| `AUD-017` | Flowise 平台状态与 Harness 领域状态可能双写 | `CLOSED_STAGE2`：migration 010 只保存描述Hash、知识快照引用、验收摘要、IntentPlan和确认状态；Flowise只保存会话/平台资源，MCP查询Harness最小状态 |
| `AUD-018` | Flowise 制品可加载不等于平台或HiAgent已运行 | `CLOSED_STAGE2_EVIDENCE_BOUNDARY`：真实 Flowise 3.0.12 MCP Client集成已通过；Agentflow发布、真实MiMo对话和HiAgent运行继续单独标记未验证 |
| `AUD-019` | 模型输出若直接成为脚本会形成任意代码执行面 | `CLOSED_STAGE3`：只接受严格 `ExecutableActionPlan` 和10操作有限DSL；Builder使用仓库内固定模板，拒绝未知操作、字段和定位器 |
| `AUD-020` | 候选脚本可能无法重建或因重试产生不同内容 | `CLOSED_STAGE3`：固定生成器版本、规范化输入、DSL Hash、来源链Hash和脚本Hash；同输入生成字节一致脚本 |
| `AUD-021` | SQLite候选来源字段被修改会破坏审计链 | `CLOSED_STAGE3`：migration 011保存执行计划、构建任务、动作事实和候选，并以不可变/禁止删除触发器保护来源与Hash字段 |
| `AUD-022` | Worker可能执行路径逃逸、篡改包或危险Node能力 | `CLOSED_STAGE3_LOCAL`：只允许受控候选目录和固定模块契约，执行前复核manifest/脚本Hash并拒绝路径逃逸、动态加载、文件/进程/命令能力 |
| `AUD-023` | 普通用户或Agent可能伪造技术并发版本调用候选编译 | `CLOSED_STAGE3`：`candidate_get`只接收业务准备引用；MCP先调用`authoring_get`并由受控服务注入当前版本，Flowise不接触该参数 |

`AUD-009...AUD-013` 完成阶段1，`AUD-014...AUD-018` 完成阶段2代码与本机集成边界，`AUD-019...AUD-023` 完成阶段3确定性Builder与受控Worker执行边界。阶段4只能读取阶段3生成且Hash一致的候选，执行两个视口各3次的真实Chromium稳定性验证；不得把Fake Page契约测试写成浏览器证据，不得提前生成证书、激活或调度候选，也不得把本机证据写成HiAgent证据。

### 2.4 仍未验证但不得遗忘

| 风险 ID | 未验证项 | 对当前工作的影响 |
|---|---|---|
| `EXT-001` | HiAgent 目标服务器能否注册并访问衡准 MCP | 不阻塞本机 I8 实现；阻塞 HiAgent 迁移验收 |
| `EXT-002` | Flowise 每个已用节点、变量、Human Input、Knowledge、MCP 语义是否逐项等价于目标 HiAgent | 无映射证据的能力必须失败关闭 |
| `EXT-003` | 第二台真实 Windows 电脑的整目录便携恢复 | 阻塞“办公电脑可无缝传播”验收 |
| `EXT-004` | MiMo v2.5 长时间 Midscene 作者化稳定性 | 可使作者化失败，不影响已验证 Playwright 正式回归 |

## 3. 冻结需求登记

### `HZ-C01` 产品与交付目标

- 衡准自动化回归闭环是实习交付主体。
- 复兴银行是本机被测系统和作品集，不在 I8 扩展全部银行业务。
- 首个纵向案例固定为门户账号密码登录后，右上角姓名/头像与个人资料一致。

### `HZ-C02` 三环境迁移链

```text
个人电脑 Flowise
→ 同源便携定义与空白数据包
→ 办公电脑 Flowise
→ 同源 Workflow/Knowledge/MCP 映射制品
→ 测试环境 HiAgent
```

平台数据库、用户、会话、凭据、缓存和真实运行数据不得跨环境复制。每个环境重新注入配置并独立验收。

### `HZ-C03` HiAgent 能力优先

- 任何与其他要求冲突时，HiAgent 真实帮助文档和真实界面证明的能力边界优先。
- Flowise 只作为个人/办公电脑实现载体，不得使用无 HiAgent 等价语义的专有节点、内部 API、数据库直写或隐藏扩展。
- 映射证据必须记录 `flowiseCapability / hiagentCapability / evidence / status / fallback`；状态不是 `VERIFIED` 时正式 Workflow 失败关闭。

### `HZ-C04` MCP 唯一外部工具通道

- Agent 平台外的鉴权、数据库、文件、浏览器、Worker、Artifact、调度和审计只通过注册的衡准 MCP 业务工具访问。
- 禁止任意 Shell、SQL、文件读写、浏览器脚本、CDP、URL Fetch 或凭据工具。
- MCP 只返回结构化状态、分页数据和脱敏 Artifact 元数据。

### `HZ-C05` Windows 免安装便携交付

- 支持范围：Windows 10/11 x64。
- 目录自带固定 Node、Flowise 依赖、Playwright、Midscene、Chromium、迁移、配置模板和 PowerShell/CMD 启停验证脚本。
- 不依赖 WSL、Docker、管理员权限、系统服务或全局 npm/Python/Java 安装。
- 通用 ZIP 只含源码/构建物、固定依赖、空白数据库模板、迁移、知识制品、配置模板、SBOM、Hash 和恢复脚本。
- 不含 `.env`、Token、账号密码、Flowise/Harness 运行数据库、用户、会话、缓存、日志、证据或真实 Fixture。
- 便携验收必须在另一绝对路径或另一台兼容 Windows 电脑完成空白启动、迁移、健康检查、首案例、停止、重启和完整性验证。

### `HZ-C06` SQLite 与权威数据

- Flowise `database.sqlite`：只对 Flowise 平台配置、Agentflow、会话、Human Input 检查点和平台知识元数据权威。
- Harness `regression_platform.sqlite`：对案例、计划、动作、脚本、证书、运行、调度、事故、决定、审计和证据元数据唯一权威。
- 两个数据库物理目录、进程权限、备份、恢复和完整性检查分离；禁止合并、`ATTACH`、跨库事务或跨库写入。
- Fineract/Mifos 和银行渠道既有数据库不转换为 SQLite，也不允许平台直写。

### `HZ-C07` 产品不包含 RAG

- 仓库 `docs/`、`rag/` 仅供开发、审计和 Codex 使用。
- 产品目录、运行时、部署包和数据模型不包含自建 `rag/`、Loader、Chunker、Embedding、Vector Store、Retriever、同步服务或 RAG API。
- Flowise/HiAgent 公开知识能力属于 Agent 平台能力；衡准只依赖导入、版本、查询和来源引用语义，不实现其内部检索结构。

### `HZ-C08` Agent 与本地工具职责

Agent 平台只负责自然语言接收、平台知识查询、案例结构化、最小澄清、验收摘要、`IntentPlan`、注册 MCP 编排、Human Input、结果解释和调度自然语言规范化。

本地工具只负责服务鉴权、Schema、幂等、namespace、SQLite 权威状态、计划编译、租约、Fixture、Midscene 候选、Playwright 事实、Builder、证书、正式执行、调度、事故、证据和审计。

### `HZ-C09` 用户输入与人工确认

- 普通用户唯一必填输入是自然语言案例描述。
- 用户不填写 namespace、幂等键、风险等级、凭据别名、工具顺序、定位器、Cron 或 taskId。
- 业务歧义、风险、脚本激活、调度创建、正式修复激活必须使用人类可读摘要确认。

### `HZ-C10` Midscene、Playwright 与 Builder

- Midscene：视觉理解和受控作者化候选，不生成脚本、不判定业务事实、不参与正式回归。
- Playwright：DOM/ARIA/URL/网络/业务事实验证、断言、取证、候选稳定性和正式回归。
- Builder：唯一脚本生成桥梁；把已验证动作和有限 DSL 通过固定模板确定性生成 `.cjs` 包。
- 主控 LLM 最多产生 Schema 受限的意图或补丁候选，不能提交任意源码。

### `HZ-C11` 上下文与输出分级

动作上下文：

| 等级 | 内容 |
|---|---|
| `CTX-L1` | 当前动作、页面签名、不变量、风险、允许目标、Fixture 引用、最近事实和租约 |
| `CTX-L2` | `CTX-L1` + 上一动作脱敏结果 + 下一动作最小预览 |
| `CTX-L3` | `CTX-L2` + 当前分支最小依赖锥 |

工具输出：

| 等级 | 类型 | 默认 | 上限 |
|---|---|---:|---:|
| `OUT-L0` | 状态/短错误 | 4 KiB | 8 KiB |
| `OUT-L1` | 创建/提交/决定回执 | 8 KiB | 16 KiB |
| `OUT-L2` | 案例/计划/事故详情 | 32 KiB | 64 KiB |
| `OUT-L3` | Artifact/证据元数据 | 64 KiB | 128 KiB |

按 UTF-8 JSON 压缩前字节计量；Harness 绝对上限 128 KiB。超限只能完整条目分页或转 Artifact 引用，不能安全降级则返回 `OUTPUT_BUDGET_EXCEEDED`。

### `HZ-C12` 脚本生成与稳定性

- DSL V1 只允许规格列出的 10 类操作。
- 定位器只允许唯一的 `getByRole / getByLabel / getByTestId`。
- 相同规范化输入必须生成字节一致脚本和相同 Hash。
- 桌面与窄屏每个视口连续 3 次，共 6 次；全部使用新 BrowserContext、独立 Fixture，断言与证据集合一致。
- 任一次失败即证书失败；修复产生新版本并重新执行完整 6 次，禁止用重试替换失败样本。

### `HZ-C13` 用户交付、激活与调度

- 稳定性通过后才返回分页脚本预览、版本、Hash、断言、证据和证书。
- 用户明确选择 `SAVE_ONLY / ACTIVATE / REJECT`；激活不自动运行或创建调度。
- `ON_DEMAND / RECURRING / ONE_TIME` 均绑定精确 `caseVersion + planId + scriptId + scriptVersion`。
- 周期用五字段 Cron + IANA 时区；一次性用带时区 `runAt`。Workflow 回显人类可读摘要，确认后只调用一次幂等创建。
- 正式执行只运行 `SCRIPT_VALIDATED` Playwright 包，不调用主控 LLM 或 Midscene。
- 在线结果由 Workflow 查询；离线结果写入 Harness 收件箱，下次会话读取。

### `HZ-C14` 反向修复

- Harness 先以确定性证据分类事故，再生成 `StepFailureEnvelope`。
- 默认只给主控 `CTX-L1`，规则证明不足时才升级到 `CTX-L2/CTX-L3`。
- 补丁仅允许定位器映射、等待条件、受控参数、步骤顺序和不削弱契约的断言实现。
- 每阶段最多 3 次；不得修改复兴银行、Harness、Worker、Flowise、HiAgent 或仓库源码，不得放宽业务断言。
- 修复候选重新生成 Hash、重新完成 6 次验证，用户另行决定激活、复跑和调度迁移。

### `HZ-C15` 知识职责

- Flowise/HiAgent 平台知识：业务规则、页面语义、术语、风险、测试原则和结果解释；对已发布语义版本权威。
- Harness SQLite：只保存知识快照引用和结构化执行事实，不复制知识正文或平台内部索引。
- 两边只交换 `knowledgeSnapshotId / sourceVersion / contentHash / citationIds` 和 MCP 脱敏摘要。
- LLM 不得直接查询任何 SQLite。

### `HZ-C16` 延期但保留的产品需求

- I8 完成后：Playwright、Selenium、Cypress、Postman、Gherkin 等外部案例适配。
- I8 完成后：本地视频拆解为可审阅动作候选，原始敏感视频不上传 Agent 平台。
- 所有导入候选仍走相同 Harness/Midscene/Builder/六次 Playwright/人工激活链。
- 衡准图形界面保持延期且只读观测，不成为 Agent、知识或控制后台。

### `HZ-C17` 主控与视觉 LLM 上下文窗口

两个模型的完整上下文容量固定如下，所有数字均为单次模型请求的总 token 窗口：

| 消费者 | 总窗口硬上限 | 输入预算 | 输出保留 | 允许上下文 |
|---|---:|---:|---:|---|
| Midscene 视觉 LLM | 16,000 | 最多 12,000 | 至少 4,000 | 默认 `CTX-L1`，规则证明需要时 `CTX-L2`，极少数分支可用裁剪后的 `CTX-L3` |
| Flowise/HiAgent 主控 LLM | 1,000,000 | 最多 967,232 | 至少 32,768 | 当前案例、已发布知识命中、Workflow 状态、MCP 脱敏摘要和当前最小依赖锥 |

计量包含系统提示、开发者提示、工具/Schema 定义、对话消息、`ActionContextEnvelope`、截图或图像折算 token、模型输出以及提供方附加的不可见模板开销。实现必须采用模型提供方实际 tokenizer/usage 作为最终值；预估不确定时按更保守值计量。

`CTX-L1/CTX-L2/CTX-L3` 的含义不因模型容量不同而改变：

- `CTX-L1`：当前动作，是视觉模型默认层。
- `CTX-L2`：上一动作脱敏结果 + 当前动作 + 下一动作最小预览，对应“上/中/下”三动作窗口。
- `CTX-L3`：只增加当前分支最小依赖锥，不等于完整计划、完整会话、完整案例库或完整项目。

视觉模型升级规则：

1. 先构造 `CTX-L1` 并进行 token 预检；不足以消歧才申请 `CTX-L2`。
2. `CTX-L2` 仍不足时，Harness 必须先裁剪重复文本、缩小/裁切截图、使用 Playwright 已验证事实或拆分动作，再决定是否发 `CTX-L3`。
3. 任一视觉请求必须满足 `estimatedInputTokens <= 12,000` 且 `input + reservedOutput <= 16,000`；无法满足时返回 `VISION_CONTEXT_BUDGET_EXCEEDED`，转纯 Playwright、主控重新规划或人工处理。
4. 禁止静默截断当前动作、不变量、风险、允许目标、租约和事实断言；禁止为了塞入16K而省略安全门禁。

主控模型规则：

1. 1M 是容量上限，不是读取仓库、SQLite、其他案例、完整日志或完整历史对话的授权。
2. 默认仍使用当前 Workflow 节点所需最小上下文；只有确定性规则证明信息不足时才扩展依赖锥。
3. 单请求必须满足 `estimatedInputTokens <= 967,232` 且 `input + reservedOutput <= 1,000,000`；超限返回 `CONTROLLER_CONTEXT_BUDGET_EXCEEDED` 并通过摘要、分页或重新拆分 Workflow 降级。
4. 主控不得把自身1M窗口转发给视觉模型；向视觉模型发送的每次包必须重新按16K硬上限构造和计量。

每个 `ActionContextEnvelope` 必须增加：`consumerType`、`contextLevel`、`modelContextLimitTokens`、`inputBudgetTokens`、`reservedOutputTokens`、`estimatedInputTokens`、`imageTokenEstimate`、`tokenizerId`、`budgetDecision` 和 `redactionProfileId`。预算决定与最终 usage 写入 Harness 审计，但不得保存秘密正文。

## 4. 文档变更事务

### 4.1 提交变更前

任何多轮新要求先形成：

```text
DecisionDelta
- affectedControlIds
- changeType: ADD | MODIFY | CANCEL | CLARIFY
- oldMeaning
- newMeaning
- reason
- affectedAuthorities
- orderChanged: true|false
- taskStateChanged: true|false
- externalEvidenceRequired
```

如果旧含义无法从权威文件定位，不得直接覆盖；先登记为歧义并回查历史或请求用户确认。

### 4.2 原子更新顺序

1. 更新本登记册对应 `HZ-Cxx`；
2. 如改变全局先后，更新唯一实施顺序；
3. 如改变任务状态/依赖/验收，更新 Backlog；
4. 如改变系统边界，更新架构基线和决策登记册；
5. 如改变代码契约，更新 I8 规格和 `contracts/`；
6. 如改变已实现事实，必须先有测试/运行证据，再更新能力矩阵；
7. 更新简明控制卡的一句话、控制项或真实状态；
8. 更新相关索引，运行校验。

这些步骤是一项文档事务；禁止只改摘要不改权威，也禁止只改深层规格不更新协作入口。

### 4.3 冲突裁决

- 运行事实冲突：测试/契约/代码/运行证据优先，文档降级为待修。
- 设计冲突：更晚且明确 `supersedes` 的 Accepted 决策优先。
- 顺序冲突：唯一实施顺序优先。
- 状态冲突：Backlog 优先。
- 用户最新明确决定与旧冻结项冲突：先登记 `DecisionDelta`，同步整条权威链后生效。
- 无 HiAgent 证据：能力失败关闭，不以 Flowise 可实现为理由放行。

## 5. 变更影响矩阵

| 改动 | 必查控制项 | 最少验证 |
|---|---|---|
| Flowise Agentflow/节点 | `HZ-C02/C03/C08/C09` | Flowise 导入、HiAgent 映射、无专有能力扫描 |
| MCP 工具 | `HZ-C04/C11` | Schema、鉴权、幂等、namespace、分页、预算、负测 |
| SQLite migration | `HZ-C06/C15` | 备份、迁移、FK、integrity、回滚、跨库隔离 |
| Midscene | `HZ-C10/C11/C14/C17` | 16K 总窗口、12K 输入门禁、上下文最小化、歧义失败关闭、Playwright 独立验证 |
| 主控 LLM | `HZ-C03/C08/C09/C14/C17` | 1M 总窗口、最小依赖锥、无全库/全项目读取、上下文超限降级 |
| Builder/DSL | `HZ-C10/C12` | 白名单、确定性 Hash、任意代码拒绝 |
| Playwright/证书 | `HZ-C12` | 2 视口 × 3 次、独立 Fixture/Context、证据一致 |
| 调度/收件箱 | `HZ-C13` | 精确版本、Cron/runAt、misfire、重启、离线恢复 |
| 便携包 | `HZ-C05` | 第二路径/第二电脑空白恢复、无全局依赖、无秘密 |
| 知识内容 | `HZ-C07/C15` | 公开导入、版本/Hash/引用、无仓库 RAG 运行依赖 |
| 外部/视频输入 | `HZ-C16` | 不执行不受信源码、隐私、本地处理、同一正式门禁 |

## 6. 文档完成定义

一次控制文档更新只有同时满足以下条件才完成：

1. 所有新决定均映射到 `HZ-Cxx` 或明确新增编号；
2. 简明卡与完整登记册含义一致；
3. 唯一实施顺序和 Backlog 没有被辅助文件复制；
4. 当前事实与目标设计严格分开；
5. 历史 Coze、当前 Flowise、目标 HiAgent 三类证据标签清楚；
6. 延期需求有 Backlog 或明确状态，不以“非目标”静默丢失；
7. `python scripts/docs/validate_docs.py`、Backlog YAML 解析和 `git diff --check` 通过；
8. 若只改文档且未改变开发 RAG 来源/配置/评测，不以 RAG 重建作为产品门禁；
9. 变更文件、验证结果和残余风险已报告，且未输出任何秘密。
