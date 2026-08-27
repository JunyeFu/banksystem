---
id: DOC-AGENT-HENGZHUN-I10-LANGGRAPH-DEEPAGENTS-MIGRATION
title: 衡准 I10 开源 Agent 控制器迁移决策与落地任务包
document_type: task
domain: agent
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# 衡准 I10 开源 Agent 控制器迁移决策与落地任务包

## 1. 文件定位与当前结论

本文件固化“将 Flowise 控制层嫁接到能力更强的开源 Agent”调研结论、目标架构、约束、实现模板和可验收任务包。它是候选迁移的规范输入，不是已实施、已发布或已上线证据。

项目级实施顺序只以 [`v54-implementation-batches.md`](./v54-implementation-batches.md) 为权威。本文件中的 AG-00—AG-08 仅是该迁移候选内部的依赖拆分；RF-009 已明确启用 AG-00，其余任务仍为 `NOT_STARTED`。

**架构决策：**

- 采用 **LangGraph.js** 作为确定性、可持久化、可中断恢复的控制器内核。
- 在严格限权的只读规划节点内采用 **Deep Agents JS**，只负责复杂语义分解、澄清和候选方案生成。
- 保留现有 Harness、MCP、Worker、SQLite、Midscene、Playwright 的权威边界；只替换 Flowise 当前承担的控制器职责。
- Flowise 在迁移期保留为对照与回滚通道，不允许新旧控制器同时写业务状态。
- 首个可执行硬门是 **AG-00 隔离 PoC**。在 PoC 证明可行之前，不引入产品依赖、不修改运行态、不发布、不运行正式 LIVE_E2E。

当前结论的置信等级为 `ARCHITECTURE_DECISION_READY_FOR_POC`，不是 `IMPLEMENTED`、`RELEASED` 或 `LIVE_E2E_PASSED`。

## 2. 当前基线与证据边界

### 2.1 源码派生基线

2026-08-25 规划时从当前 D 盘权威 checkout 读取：

```text
repository = D:/Agent/banksystem
product = D:/Agent/banksystem/platform/hengzhun-regression-system
currentReleaseIdentity = fbe97820dbb5d8132a3f678d886524a5f75215b212bb5181cfda8960fca69630
releaseCodeSetFileCount = 160
formalAcceptanceLedger = 0/18 under current identity
```

当前 Flowise v7 图的静态派生规模：

```text
nodes = 345
edges = 395
toolNodes = 108
conditionNodes = 59
humanInputNodes = 38
governedMcpTools = 33
```

这些数值用于说明控制图复杂度和迁移面，不证明运行成功。数值必须在 AG-00 开始前从当时源码重算，不得作为永久固定常量。

### 2.2 不得混淆的证据层

| 层级 | 可以证明 | 不能证明 |
|---|---|---|
| 静态/合同 | 类型、图结构、工具策略、依赖锁定正确 | 服务可用、发布成功 |
| 集成 | Agent、MCP、Harness 在隔离环境协作 | 真实外部模型和浏览器链已通过 |
| Shadow | 同输入下新旧控制器的提案和读取结果可比 | 新控制器可以正式写入 |
| LIVE_E2E | 指定 ReleaseIdentity 下真实链路通过 | 其他身份、其他控制器仍通过 |
| 人工验收 | 业务摘要、风险和交互符合预期 | 可替代技术证据或账本事实 |

控制器代码、图定义、提示词、工具策略或模型配置身份发生变化时，旧控制器的正式验收记录不得计入新身份。

## 3. 候选方案比较

| 候选 | 长项 | 主要代价/风险 | 决策 |
|---|---|---|---|
| LangGraph.js + Deep Agents JS | TypeScript 同栈；显式状态图、checkpoint、interrupt；MCP 适配；深层语义规划能力 | 必须自行约束状态双写、工具权限和提示词漂移 | **主方案** |
| Mastra | TypeScript 体验好；Agent、MCP、workflow snapshot 集成度高 | 与现有自研控制面重叠较多；仍需做同等治理封装 | **AG-00 失败时的 PoC 备选** |
| Microsoft Agent Framework | 企业治理、工作流、checkpoint 和多语言生态强 | 当前主实现会引入 Python/.NET/Go sidecar 与额外运维边界 | **企业平台要求出现时再评估** |
| Dify | 操作台、知识与应用管理成熟 | 不是本项目控制内核的最小替换；许可证附加条件需单独法务核对 | **仅考虑 UI/RAG 外层，不作控制内核** |
| CrewAI / PydanticAI | 多 Agent 或 Python 类型化体验突出 | 与当前 Node/TypeScript 运行栈和既有控制合同不匹配 | **不进入首轮 PoC** |

### 3.1 选择理由

选择 LangGraph.js 的关键不是“Agent 更聪明”，而是它允许把智能推理限制在明确节点内，同时把审批、中断恢复、单次变更、幂等和对账做成可测试的确定性图。Deep Agents 只补足长任务分解和语义规划，不获得业务状态所有权。

### 3.2 官方资料

- [LangGraph.js persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangChain.js MCP](https://docs.langchain.com/oss/javascript/langchain/mcp)
- [Deep Agents JS overview](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [Deep Agents repository and security guidance](https://github.com/langchain-ai/deepagents)
- [LangGraphJS MIT license](https://github.com/langchain-ai/langgraphjs/blob/main/libs/langgraph-core/LICENSE)
- [Mastra MCP guide](https://mastra.ai/docs/agents/mcp-guide)
- [Mastra workflow snapshots](https://mastra.ai/en/reference/workflows/snapshots)
- [Mastra license](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md)
- [Microsoft Agent Framework overview](https://learn.microsoft.com/en-us/agent-framework/overview/)
- [Microsoft Agent Framework checkpoints](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)
- [Microsoft Agent Framework license](https://github.com/microsoft/agent-framework/blob/main/LICENSE)
- [Dify repository](https://github.com/langgenius/dify)
- [Dify license](https://github.com/langgenius/dify/blob/main/LICENSE)

依赖版本、许可证文本和安全公告具有时效性；AG-00 必须按当日官方源重新核验并锁定，不以本文件中的链接代替供应链审查。

## 4. 目标架构与所有权

```text
Web / Chat / Public API
          |
          v
Controller Gateway
    |                     |
    | shadow/rollback     | candidate
    v                     v
FlowiseAdapter       AgentController
                          |
                          +-- LangGraph.js state graph
                          +-- bounded DeepAgentPlanner
                          +-- Schema Guard
                          +-- Exact Approval Gate
                          +-- Single Mutation Gate
                          |
                          v
                   Governed MCP facade
                          |
                          v
                       Harness  <----> SQLite authority
                          |
                          v
             Worker / Midscene / Playwright
```

### 4.1 不可转移的权威

| 事实或动作 | 唯一权威 |
|---|---|
| Journey、Preparation、版本、租约、幂等、业务状态 | Harness + SQLite |
| 可调用工具集合与参数合同 | 受治理 MCP 合同 |
| 浏览器事实、断言和正式通过 | Playwright + Harness |
| 视觉候选观察 | Midscene，仅作候选证据 |
| 对话恢复位置和规划草稿 | Agent checkpoint，仅作投影/游标 |
| 高风险动作批准 | 用户精确确认 + Harness 策略校验 |
| ReleaseIdentity 与验收账本 | 现有 I10 身份和账本机制 |

Agent checkpoint 不得成为第二个业务数据库。恢复时必须先从 Harness 读取权威状态并对账；不一致时失败关闭。

### 4.2 控制器边界

`ControllerGateway` 只允许在请求开始时选择一个控制器。一次 Journey 从开始到结束只有一个写入者；影子控制器只能读取和生成对比提案。切换写入者需要新的受控 Journey 或明确迁移协议，禁止运行中静默切换。

## 5. 业务常识与强制不变量

1. 银行业务的“看懂”和“执行”是两种权限。模型理解正确不等于可以提交。
2. 相同按钮在不同账户、金额、日期和审批状态下风险不同，风险来自 Harness 业务上下文，不能只由文案分类。
3. 一次用户批准只对应一份冻结提案。提案的动作、参数、目标或预期版本变化后必须重新确认。
4. 转账、审批、冲正、核销、权限变更、删除等有副作用动作不得自动重试。
5. 每轮最多执行一个变更工具；变更后必须从 Harness 回读并对账，再决定下一步。
6. 图片只进入既有本地 OCR/视觉取证边界。Agent 只读取已确认的结构化事实和 artifact 引用，不直接把图片描述当业务事实。
7. 凭据只以 `credentialRef` 传递。模型、checkpoint、trace、prompt、scratch 文件和错误消息均不得出现明文秘密。
8. 子 Agent 只读。它们可以研究、比较和归纳，不得调用写工具、访问宿主文件系统、Shell、SQLite、浏览器或凭据。
9. 所有正式状态变更继续服从预期版本、租约、幂等键、目标锁定和允许目标策略。
10. 任何“Agent 自报成功”都不是通过；最终事实必须由 Harness/Playwright 回读。

## 6. 工具权限模型

### 6.1 只读工具

```ts
type ReadOnlyTool =
  | 'journey.get'
  | 'preparation.get'
  | 'case.get'
  | 'target_profile.get'
  | 'knowledge_snapshot.get'
  | 'artifact.metadata.get'
  | 'capability.get'
```

只读规划节点和子 Agent 只获得这组经过适配的工具。实际名称以 MCP 现行 33 工具合同映射为准；不得直接把整个 MCP server 暴露给模型。

### 6.2 变更工具

```ts
type MutatingTool =
  | 'journey.advance'
  | 'preparation.update'
  | 'case.freeze'
  | 'authoring.dispatch'
  | 'script.activate'
  | 'schedule.create'
```

上面是角色模板，不是当前 MCP 的字面工具清单。正式映射必须在 AG-01 从合同生成。变更工具只能由 LangGraph 的确定性 `execute_one_mutation` 节点调用，Deep Agent 不可见。

## 7. 实现模板

### 7.1 稳定控制器端口

```ts
export interface ControllerPort {
  start(input: StartControllerInput): Promise<ControllerResult>
  resume(input: ResumeControllerInput): Promise<ControllerResult>
}

export type ControllerKind = 'flowise-v7' | 'langgraph-deepagents-v1'

export interface ControllerResult {
  controllerKind: ControllerKind
  threadId: string
  journeyId: string
  status: 'COMPLETED' | 'AWAITING_USER' | 'FAILED_CLOSED'
  message: string
  proposalRef?: string
  harnessVersion: number
}
```

Gateway 依赖 `ControllerPort`，不得依赖 LangGraph 或 Flowise 的内部状态格式。

### 7.2 Agent 状态

```ts
export interface ControllerState {
  threadId: string
  namespace: string
  controllerKind: 'langgraph-deepagents-v1'
  journeyId: string
  preparationId?: string
  expectedVersion: number
  releaseIdentityHash: string
  requestId: string
  knowledgeSnapshotRef?: string
  frozenProposal?: {
    proposalId: string
    contentHash: string
    summary: string
    risk: 'LOW' | 'MEDIUM' | 'HIGH'
    expiresAt: string
  }
  mutationCount: 0 | 1
  lastHarnessReadHash: string
}
```

禁止复制凭据、浏览器状态、完整 artifact、SQLite 记录或不可验证的“长期记忆”到该状态。

### 7.3 图结构

```text
hydrate_from_harness
  -> classify_and_plan_read_only
  -> validate_structured_proposal
  -> freeze_proposal
  -> interrupt_for_exact_decision
  -> execute_one_mutation
  -> reconcile_from_harness
  -> render_response
```

各节点必须满足：

- `hydrate_from_harness`：以 Harness 事实覆盖 checkpoint 投影。
- `classify_and_plan_read_only`：可调用 Deep Agent，但仅开放只读工具和隔离 scratch VFS。
- `validate_structured_proposal`：JSON Schema、风险、目标、版本和工具策略全部通过。
- `freeze_proposal`：生成稳定 `proposalId/contentHash`，之后不可隐式改写。
- `interrupt_for_exact_decision`：确认内容必须包含动作、关键参数、风险和预期结果。
- `execute_one_mutation`：核对 hash、过期时间、expectedVersion、幂等键，且本轮 `mutationCount=0`。
- `reconcile_from_harness`：回读权威状态；不一致即 `FAILED_CLOSED`。

### 7.4 单次变更门

```ts
async function executeApprovedMutation(state: ControllerState, decision: UserDecision) {
  assert(state.frozenProposal)
  assert(decision.proposalId === state.frozenProposal.proposalId)
  assert(decision.contentHash === state.frozenProposal.contentHash)
  assert(Date.now() < Date.parse(state.frozenProposal.expiresAt))
  assert(state.mutationCount === 0)

  const result = await deterministicMcpInvoker.invoke({
    proposalRef: state.frozenProposal.proposalId,
    expectedVersion: state.expectedVersion,
    idempotencyKey: decision.idempotencyKey,
  })
  return { result, mutationCount: 1 as const }
}
```

### 7.5 ReleaseIdentity 扩展模板

新控制器进入任何正式验收前，ReleaseIdentity 至少增加：

```json
{
  "controller": {
    "kind": "langgraph-deepagents-v1",
    "frameworkLockHash": "sha256:...",
    "graphSourceHash": "sha256:...",
    "promptAndSkillsHash": "sha256:...",
    "toolPolicyHash": "sha256:...",
    "modelConfigIdentity": "provider/model/parameters-without-secret",
    "checkpointSchemaVersion": "1"
  }
}
```

不得把 API Key、Token、endpoint credential 或完整环境变量写入身份对象。

## 8. 易错点与失败关闭规则

| 易错点 | 后果 | 强制防线 |
|---|---|---|
| 把 Agent checkpoint 当主库 | 双写、恢复漂移 | 每次恢复先读 Harness；checkpoint 只存引用和游标 |
| 给 Deep Agent 整个 MCP 工具集 | 越权变更或组合攻击 | 只读 allowlist；写工具物理隔离到确定性节点 |
| 用户确认后模型重新规划 | 批准内容与执行内容不一致 | 冻结 hash；任何变化必须重新确认 |
| 对有副作用动作自动重试 | 重复转账/审批 | 幂等 + 单变更门 + 结果不明即人工处理 |
| 新旧控制器同时写 | 状态竞争、证据不可归因 | Journey 级单写者；shadow 永远只读 |
| 把 OCR/视觉输出当断言 | 产生伪通过 | Playwright/Harness 独立验证 |
| 将提示词热更新排除在身份外 | 旧证据错误复用 | prompt/skills hash 进入 ReleaseIdentity |
| 把模型版本别名当稳定版本 | 行为漂移 | 记录可获得的模型快照/配置身份并重取证据 |
| 直接安装最新依赖做 PoC | 污染 lockfile 和发布面 | 隔离目录、精确版本、许可证/审计/磁盘预检 |
| 用 Flowise 18/18 证明新 Agent | 控制器身份错配 | 新控制器身份从 0/18 建账 |

任一策略无法确定、Harness 版本不一致、批准 hash 不一致、工具返回结果不明或对账失败时，统一停止在 `FAILED_CLOSED`，不自动猜测修复。

## 9. 落地任务包

### AG-00：隔离候选 PoC

**状态：** `COMPLETE / GO_LANGGRAPH`，RF-009/S1 已关闭；只获得 CONTRACT/synthetic INTEGRATION 证据。

**目标：** 在产品依赖和正式运行态之外，证明 LangGraph.js + Deep Agents JS 能完成一个只读规划、一次中断恢复、一次受控模拟变更和 Harness 回读对账。

**允许面：** 新建隔离 PoC 目录、精确 lockfile、模拟 MCP/Harness、合同测试和评估数据；不得改产品 `package.json`、数据库、Flowise 发布物或服务。

**交付物：** 候选依赖审查、许可证记录、最小图、checkpoint 恢复测试、工具隔离测试、prompt-injection 测试、Mastra 轻量对照结果。

**退出门：** 全部测试通过；无写工具泄露；恢复后以 Harness 覆盖 checkpoint；依赖风险可接受；形成 `GO_LANGGRAPH`、`TRY_MASTRA` 或 `NO_GO` 决策。首次确定性安全失败停止扩面。

**回滚：** 删除隔离 PoC 变更即可，不触碰正式运行态。

### AG-01：ControllerPort 与工具分类

**状态：** `COMPLETE`，RF-010/S1 已关闭；33 工具已唯一分为 11 READ_ONLY / 22 MUTATING。

**目标：** 建立 FlowiseAdapter/AgentController 共用的稳定端口，从现有 MCP 合同生成只读/变更/禁止三类清单。

**验收：** 33 个工具均唯一归类；未知工具默认拒绝；Gateway 合同测试不依赖具体框架；Flowise 行为未改变。

### AG-02：受限 Agent 内核

**状态：** `COMPLETE`，RF-011/S1 已关闭；聚焦 synthetic CONTRACT/INTEGRATION 10/10。

**目标：** 实现显式状态图、结构化提案、schema guard、精确批准中断、单次变更节点和 Harness 对账。

**验收：** 单元、属性、恢复、并发、幂等、过期确认、hash 不匹配、提示词注入和工具越权测试全部失败关闭。

### AG-03：状态、秘密与可观测性

**状态：** `COMPLETE`，RF-012/S1 已关闭；安全与内核矩阵 15/15。

**目标：** 固定 checkpoint schema、namespace/thread 映射、保留期、脱敏 trace、isolated scratch VFS 和事故清理流程。

**验收：** secret scan 无命中；跨 namespace 读取失败；checkpoint 损坏/过期可安全恢复；trace 能关联 request、journey、proposal、tool、Harness version。

### AG-04：ReleaseIdentity 与证据升级

**状态：** `COMPLETE`，RF-013/S1 已关闭；ReleaseIdentity v3 为 `ca0430ca...9089`，聚焦矩阵 29/29，账本 0/18。

**目标：** 将控制器代码、依赖、图、prompt/skills、工具策略、模型配置和 checkpoint schema 纳入身份。

**验收：** 任一受控输入变化都会改变身份；秘密变化不进入身份内容；旧 Flowise 证据自动标记 stale；账本从新身份 0/18 开始。

### AG-05：只读 Shadow 对照

**状态：** `LIVE_ATTEMPT_FAILED_PRE_REQUEST`；离线 Shadow 比较器与失败关闭指标合同 8/8。`HENGZHUN-I10-AG05-SHADOW-LIVE-001` 已授权，但执行器因 CommonJS stdin 中使用顶层 `await` 在发送请求前确定性失败，按约停止并关闭全部服务；身份与账本未变。修复后重试需要新的明确授权。

**目标：** 复制脱敏输入给新控制器，只比较读取、分类、提案、澄清和风险输出；Flowise 保持唯一写入者。

**指标：** schema 有效率、工具选择一致率、风险分级重大分歧、澄清轮次、延迟、token/成本、恢复成功率、越权尝试数。

**退出门：** 零越权、零状态写入；所有重大分歧完成归因；达到预先冻结阈值。Shadow 成功不授权切流。

### AG-06：L1 薄链候选切流

**状态：** `NOT_STARTED`，依赖 AG-05，且需要明确 LIVE_E2E 授权。

**目标：** 只在 L1 `TEXT_ONLY` 与 `TEXT_WITH_IMAGE` 上让新控制器成为单写者，Flowise 作为可回滚但不并发写入的通道。

**执行规则：** 先冻结新 ReleaseIdentity；按文字、带图顺序执行；首次确定性失败立即停止；不得复用旧身份 PASSED 记录。

**退出门：** L1 双输入语义等价、Harness/Playwright 事实一致、零双写、回滚演练成功。

### AG-07：18 链扩展与正式切流

**状态：** `NOT_STARTED`，依赖 AG-06，逐阶段单独授权。

**目标：** 按当前正式验收合同将新身份扩展到完整 18 链，保持首次确定性失败停止规则。

**退出门：** 同一冻结身份下 18/18；文字/图片成对语义等价；无 stale 复用；发布回读、身份、账本和证据一致；人工验收通过。

### AG-08：Flowise 退役或长期回滚保留

**状态：** `NOT_STARTED`，依赖 AG-07 和项目所有者决策。

**目标：** 决定卸载、冷备或限时回滚保留；清除不再需要的运行权限和供应链面。

**退出门：** 恢复演练、数据保留、许可证清单、运维手册、故障切换和删除范围经人工批准。任何删除必须另行明确授权。

## 10. 验证矩阵

| 门 | 必需证据 | 硬失败条件 |
|---|---|---|
| 依赖门 | 精确版本、lock hash、license、audit、磁盘影响 | 来源/许可证/高危依赖不明 |
| 合同门 | ControllerPort、工具分类、schema、错误码 | 未知工具可调用或类型可绕过 |
| 安全门 | 越权、注入、secret、namespace、VFS 测试 | 任一秘密泄漏或写工具暴露 |
| 状态门 | 中断恢复、版本冲突、幂等、损坏恢复 | checkpoint 可覆盖 Harness |
| Shadow 门 | 只读 trace 和预冻结指标 | 新控制器产生任一业务写入 |
| L1 门 | 新身份、双输入、真实回读、回滚 | 首个确定性失败或证据错配 |
| 全量门 | 同身份 18/18、成对等价、人工验收 | stale 复用、双写、身份漂移 |

## 11. 切流与回滚原则

1. AG-00—AG-04 只建立候选能力和身份合同，不改变正式流量。
2. AG-05 只读 shadow；Flowise 是唯一写入者。
3. AG-06 只切 L1 新 Journey，并在入口固定新控制器；已开始的 Flowise Journey 不迁移。
4. 发现确定性失败，停止新增 Journey；等待在途单写者完成或安全终止，再把入口切回 Flowise。
5. 回滚后，新 Agent 产生的证据继续保留为失败/诊断记录，不改写为 Flowise 成功。
6. AG-07 达成新身份 18/18 且人工接受后，才可讨论 AG-08。

## 12. 延后决策

- checkpoint 存储后端：AG-00 用隔离实现验证语义，正式选型在 AG-03 决定。
- 模型供应商与具体模型：以现有合规和运行约束为输入，在 AG-00 冻结评估矩阵，不在架构层绑定。
- Mastra 是否继续：只在 LangGraph 出现不可接受的工程/安全缺口时进入二轮 PoC。
- Dify UI/RAG：当前没有控制器替换必要性，保留为独立未来选择。
- Flowise 最终删除：只有 AG-08 可决定，当前默认保留回滚能力。

## 13. 下一硬门

AG-00 已以 `GO_LANGGRAPH` 关闭。下一硬门是为 **AG-01 ControllerPort 与工具分类** 建立新的实施顺序、backlog、批次、切片和命令级任务包；AG-00 已完成的前置为：

1. 重算当前图/MCP/ReleaseIdentity 基线；
2. 核对官方版本、许可证、安全公告、lockfile 和磁盘影响；
3. 冻结 PoC 允许路径、禁止路径、测试集和 `GO/NO_GO` 标准；
4. 明确 PoC 不启动正式服务、不发布、不写业务库、不运行正式 LIVE_E2E。

AG-00 的 `GO_LANGGRAPH` 只允许细化 AG-01；产品安装、shadow、切流和 LIVE_E2E 仍未授权。
