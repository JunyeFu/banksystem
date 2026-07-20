---
id: DOC-ARCH-HENGZHUN-FLOWISE-SQLITE-HIAGENT-V1
title: 衡准 Flowise、SQLite 与 HiAgent 回归系统架构基线 V1
document_type: architecture-baseline
domain: regression-platform
status: accepted
authority: normative
version: 1.4
effective_date: 2026-07-20
owner: project-owner
supersedes:
  - DOC-ARCH-HENGZHUN-DIFY-HIAGENT-PORTABLE-V1
  - DOC-ARCH-COZE-HARNESS-BOUNDARY
  - DOC-C8FCE46626
---

# 衡准 Flowise、SQLite 与 HiAgent 回归系统架构基线 V1

> 本文先冻结“哪些操作在 Agent 平台执行、哪些操作在本地工具集执行”，再据此分配 Flowise 平台知识库、Flowise 平台 SQLite 和衡准 SQLite 结构化执行知识库的职责。仓库 `rag/` 只用于开发，完整衡准系统不包含自研 RAG 结构。项目实施先后仍只由 [`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md) 定义。

## 1. 当前目标

I8 使用 Windows 原生 Flowise 3.0.12 作为个人电脑和办公电脑上的唯一自然语言入口与主控 Workflow，使用 SQLite 作为 Flowise 平台数据库和衡准回归领域数据库，使用 MCP 作为 Flowise/HiAgent 访问平台外工具的唯一通道。

测试环境服务器最终用 HiAgent 替换 Flowise 主控。只有能映射到 HiAgent 已证明能力的 Flowise 节点、变量、人工确认、知识检索和 MCP 调用才能进入正式 Workflow。

Flowise Windows 隔离探针已经证明 Windows 原生启动、Flowise SQLite、MiMo v2.5、MCP、Human Input、知识检索、流程导出和整目录复制重启可行；这只授权进入集成设计，不等于 I8 已完成。

## 2. 固定调用链

```text
用户
→ Flowise Agentflow V2
→ Flowise 平台知识查询
→ 主控 LLM 形成结构化意图
→ Human Input（只有业务歧义或风险需要时）
→ MCP Client
→ 衡准 MCP Server
→ Harness / regression_platform.sqlite
→ Script Package Builder / Scheduler
→ Midscene / Playwright / Chromium
→ 复兴银行
→ Harness 结果与证据
→ MCP
→ Flowise 解释与用户选择
```

正式定期回归不经过 Flowise、HiAgent、LLM 或 Midscene，由 Harness Schedule 直接调用纯 Playwright Worker。

## 3. 操作分配总原则

- 需要自然语言理解、语义检索、对话澄清、展示或人工选择的操作放在 Flowise。
- 需要身份校验、权威状态、确定性执行、本地资源、敏感信息、版本控制或审计的操作放在本地工具集。
- Agent 平台只能通过已注册 MCP 业务工具访问本地能力，不能直接访问文件、SQLite、Shell、浏览器、凭据或任意网络地址。
- LLM 输出只能是候选结构化数据，不是业务事实、测试通过结论或数据库状态。
- Playwright 与受控业务接口产生事实；Harness 决定状态；用户决定激活和高风险操作。

## 4. Flowise Agent 平台操作

Flowise 只执行以下操作：

| 操作 | 输入 | 输出 | 禁止事项 |
|---|---|---|---|
| 自然语言接收 | 用户案例描述 | 原始需求和会话请求 ID | 不要求用户填写技术参数 |
| 平台知识查询 | 案例描述、知识域 | 带来源引用的平台知识片段 | 不从模型记忆补齐缺失事实，不访问仓库 RAG |
| 案例结构化 | 用户描述、知识片段 | `RegressionCaseDraft` 候选 | 不写 SQLite，不生成源码 |
| 最小澄清 | 结构化缺口 | 一个业务问题或无需澄清 | 不询问 namespace、Token、Cron 等实现参数 |
| 验收摘要 | 案例草案 | 人类可读目标、步骤、断言、证据和风险 | 不宣称脚本已通过 |
| 意图规划 | 已确认草案 | `IntentPlan` 候选 | 不生成定位器、Playwright API 或脚本源码 |
| 工具编排 | Harness 返回的 ID/状态 | 下一次已注册 MCP 工具调用 | 不自行构造本地路径、SQL、Shell 或任意 URL |
| 人工确认 | 候选、风险、调度摘要 | `APPROVE/REJECT/SAVE_ONLY/ACTIVATE` | 不代表 Harness 状态已改变 |
| 结果解释 | Harness 状态、断言摘要、证据元数据 | 中文结果说明和下一步选择 | 不改写失败为成功，不内联秘密或完整日志 |
| 调度语义转换 | “每周一九点”等自然语言 | 规范化时间候选和人类可读回显 | 不直接创建调度，确认后才调 MCP |

Flowise Workflow 不保存回归领域实体的权威副本。会话变量只保存当前交互所需的对象 ID、版本、幂等键和脱敏摘要。

## 5. 本地工具集操作

### 5.1 MCP Server

- 校验服务身份、来源、namespace、Schema、幂等键和输出预算；
- 把 14 个稳定业务工具映射到 Harness；
- 只返回 ID、版本、状态、摘要和脱敏 Artifact 元数据；
- 禁止暴露任意文件、SQL、Shell、浏览器脚本和任意 URL 工具。

### 5.2 Harness

- 持有案例、计划、动作、脚本、运行、调度、事故、修复、决定和证据元数据的状态机；
- 生成 requestId、namespace、runId、taskId、版本和审计事件；
- 管理鉴权、幂等、租约、并发、重试、风险门禁、人工决定和输出预算；
- 通过唯一 `regression_platform.sqlite` 原子持久化回归领域状态；
- 不把 LLM 文本直接写成已验证事实。

### 5.3 Script Package Builder

- 把已验证动作和有限 DSL 确定性编译为 Node 20 CommonJS Playwright 包；
- 生成来源链、版本、Manifest 和 SHA-256；
- 拒绝模型任意源码、动态模块、任意路径和命令执行；
- 候选只写入受管 `.data`，不得覆盖仓库预置脚本。

### 5.4 Midscene

- 只在作者化阶段读取 `CTX-L1/CTX-L2/CTX-L3` 动作上下文和当前截图；
- 输出视觉观察和候选语义目标；
- 不决定业务事实，不生成 Playwright 源码，不参与正式定时回归。

### 5.5 Playwright Worker

- 重放动作并验证 DOM/ARIA、URL、请求、响应和业务断言；
- 使用全新 BrowserContext、独立 Fixture 和受控网络；
- 执行候选稳定性验证和正式回归；
- 生成脱敏报告、遮罩截图、日志和 Hash；
- 不在运行时调用 LLM 修补脚本。

### 5.6 Scheduler 与结果收件箱

- 只运行精确绑定 `caseVersion + planId + scriptId + scriptVersion` 的 `SCRIPT_VALIDATED` 包；
- 管理周期、一次性执行、misfire、有限重试、失败暂停和人工恢复；
- 将终态写入结果收件箱，不依赖 Agent 会话持续在线。

## 6. 两个知识库与三类存储边界

系统逻辑上只有两个知识库：Flowise 平台知识库和衡准 SQLite 结构化执行知识库。物理上另有 Flowise 自身的 SQLite 平台数据库；它只是平台持久化，不是第三个业务知识库。

### 6.1 Flowise 平台知识库

物理形态：Flowise 公开界面管理的平台原生知识功能。衡准只依赖“导入、版本、查询、来源引用”这些可迁移语义，不建设自研 Loader、Chunker、Embedding、Vector Store、Retriever、同步服务或独立 RAG API。Flowise 内部如何实现知识检索视为平台内部细节，不写入衡准业务架构，也不得暴露给 Harness。

只保存适合平台知识查询的非结构化或半结构化知识：

- 复兴银行页面用途、业务术语和用户角色说明；
- 登录、账户、权限与错误恢复的业务规则；
- 页面语义、可访问名称和稳定交互意图，不保存临时定位器；
- 测试设计原则、风险规则、证据要求和失败解释手册；
- 用户可理解的调度、人工确认和结果解释规则；
- 每条知识的 `sourceId/version/contentHash/effectiveAt/citation`。

禁止保存：账号密码、Token、Cookie、Storage State、Fixture 实值、运行状态、租约、脚本源码、候选状态、Schedule 状态、事故终态、Artifact 原文和未脱敏证据。

Flowise 知识查询结果只是生成候选计划的语义依据，不是回归状态权威。每次使用都必须把知识快照 ID、版本、Hash 和引用 ID 提交给 Harness。

### 6.2 Flowise 平台 SQLite

物理文件：Flowise 固定 `DATABASE_TYPE=sqlite` 产生的 `database.sqlite`，位于 Flowise 自己的受管数据目录。

只保存 Flowise 平台运行所需内容：

- Agentflow/Chatflow 定义和节点配置；
- 凭据的加密引用，不保存到通用交付包；
- 会话、消息、执行检查点和 Human Input 暂停状态；
- 平台知识配置、导入资源元数据和平台内部知识引用；
- Flowise 用户、API 配置和平台审计元数据。

它不是衡准回归领域事实源。不得在其中直接写案例、脚本激活、调度、事故或测试通过状态；不得通过 Flowise 内部数据库绕过公开 Workflow/MCP。

### 6.3 衡准结构化执行知识库

物理文件：Harness 独占的 `.data/sqlite/regression_platform.sqlite`。

这是衡准自动化回归领域唯一事实源，同时承担“结构化执行知识库”和状态数据库：

- 案例、案例版本、知识快照引用；
- `IntentPlan`、`ExecutableActionPlan`、动作游标、租约和 Playwright 事实记录；
- 页面签名、受控语义目标、稳定定位器映射和 Fixture 引用；
- 有限 DSL、候选脚本、脚本版本、Manifest、Hash 和稳定性证书；
- 运行、任务、调度、一次性执行、结果收件箱；
- 事故分类、`StepFailureEnvelope`、修复候选和人工决定；
- Artifact/Evidence 元数据、脱敏状态、Hash、保留和访问审计。

禁止保存 Flowise 知识正文、向量、Embedding、完整对话、凭据明文、截图/Trace 原文或脚本运行目录。原始 Artifact 位于受管文件目录，SQLite 只保存元数据和 Hash。

LLM、Flowise 和 HiAgent 均不得直接查询该 SQLite，只能调用 MCP 业务工具。

## 7. 双知识库同步规则

Flowise 平台知识库与 `regression_platform.sqlite` 不做双向全文同步，只传递最小引用：

```text
Flowise 检索
→ knowledgeSnapshotId / sourceVersion / contentHash / citationIds
→ MCP
→ Harness 记录引用
```

- Flowise 通过平台公开知识能力保存知识正文和平台内部检索资源；Harness 只保存快照引用和使用证据。
- Harness 保存已验证执行事实；Flowise 只通过 MCP 读取脱敏摘要，不写回语义知识库。
- 业务知识更新产生新知识版本，既有脚本继续绑定旧快照，重新编译后才能迁移。
- 页面事实变化产生新计划/脚本版本，不自动改写业务知识正文。
- 同一实体不得同时在 Flowise 和 Harness 标记为权威；冲突时结构化运行事实以 Harness/Playwright 为准，业务语义以已发布 Flowise 知识版本为准。

## 8. 数据库隔离与便携

```text
.data/
├── flowise/
│   ├── database.sqlite
│   └── platform-data/
├── sqlite/
│   └── regression_platform.sqlite
├── artifacts/
├── evidence/
└── logs/
```

- 两个 SQLite 文件禁止合并、ATTACH、跨库事务或由同一业务代码直写。
- Flowise 进程只拥有 Flowise 数据目录；Harness 只拥有衡准 SQLite 和受管 Artifact 目录。
- 备份时先受控停止 Flowise 写入，再分别执行 Flowise 数据备份和 Harness 在线备份/完整性检查。
- 通用压缩包包含空白数据库模板、迁移和知识制品，不包含用户、会话、凭据、运行数据库或真实证据。
- 恢复后分别验证 Flowise `database.sqlite`、平台知识资源和 `regression_platform.sqlite`，不得用一个数据库健康代替另一个。
- 个人/办公电脑交付固定为 Windows 10/11 x64 解压即用目录：自带 Node、Flowise 依赖、Playwright、Midscene、Chromium、迁移与启动/停止/验证脚本，不依赖 WSL、Docker、管理员权限或全局安装。其他操作系统和 CPU 架构不在“任何电脑”承诺范围内。
- 便携验收必须在第二个全新绝对路径完成解压、空白初始化、启动、首个案例、停止、重启和 Hash 核验；复制个人电脑的运行数据库、凭据、缓存或会话不算便携成功。

## 8.1 两套互不混用的分级机制

- 动作上下文使用 `CTX-L1 / CTX-L2 / CTX-L3`：当前动作、相邻动作、最小依赖锥逐级扩展。
- MCP 输出预算使用 `OUT-L0 / OUT-L1 / OUT-L2 / OUT-L3`：状态、回执、详情、元数据四级。默认/上限依次为 `4/8 KiB`、`8/16 KiB`、`32/64 KiB`、`64/128 KiB`，Harness 绝对上限 `128 KiB`。
- 两套级别只共享“最小必要信息”原则，不共享含义。超出输出预算必须按完整条目分页或转 Artifact 引用；禁止静默截断 JSON、UTF-8 字符或单条记录。

## 8.2 模型上下文硬上限

- Midscene 视觉 LLM 的单次完整上下文窗口固定为 16,000 tokens。系统/工具提示、文本、`CTX` 包、截图/图像 token 和输出全部计入；输入最多 12,000，至少保留 4,000 给结构化输出。
- Flowise/HiAgent 主控 LLM 的单次完整上下文窗口固定为 1,000,000 tokens；输入最多 967,232，至少保留 32,768 给结构化输出。
- 视觉模型默认 `CTX-L1`，只有确定性消歧规则才能升级 `CTX-L2` 或裁剪后的 `CTX-L3`。主控即使有 1M 容量，也不得读取完整仓库、SQLite、其他案例、秘密或无关历史。
- Harness 必须按消费者独立预估和记录 token 预算。视觉上下文无法压入 16K 时不得静默删除安全字段，必须返回 `VISION_CONTEXT_BUDGET_EXCEEDED` 并转纯 Playwright、重新规划或人工处理；主控超限返回 `CONTROLLER_CONTEXT_BUDGET_EXCEEDED`。

### 8.3 当前实现边界（2026-07-20 阶段4落地后）

当前 I0—I7 历史代码仅实现了 Harness/SQLite 层的滑动状态：完整计划持久化、游标、上一动作摘要、当前动作、下一动作预览、最近观察、页面状态、单动作租约，以及 Playwright 验证成功后推进。历史 `test:i4` 当前 3/3 通过。

I8 阶段1已经以 migration 009、严格 `ActionContextEnvelope`、不可变 `context_budget_audits`、确定性 `CTX-L1→L2→L3`、视觉16K/12K和主控1M预算函数、图像token预估、预算错误码及Worker完整Envelope提示替代历史宽松调用。纯Playwright路径记录 `NOT_INVOKED`；当前Midscene版本未公开usage时记录 `NOT_EXPOSED`，不得填写猜测值。

I8 阶段2进一步落地了可迁移 Agentflow、Flowise 平台知识制品、HiAgent能力映射、Bearer MCP 14工具白名单、migration 010 和 `PREPARED→REJECTED/AWAITING_STAGE3` 权威交接。真实 Flowise 3.0.12 MCP Client 已调用三项活跃工具并贯通 Harness/SQLite；其余11项按阶段失败关闭。

I8 阶段3进一步落地 migration 011、严格 `ExecutableActionPlan`、10操作有限DSL、确定性Builder、候选版本/Hash/来源链、不可变SQLite记录以及Worker目录/Hash/能力白名单。MCP现启用`candidate_get`，由服务端注入受控并发版本，累计4项活跃、10项失败关闭。

I8 阶段4进一步落地 migration 012、固定两个视口各3次、每样本全新BrowserContext/空storage state/独立Fixture、候选与运行时指纹、脱敏证据Hash回验和不可变`StabilityCertificate`。常驻Worker已进入稳定性Claim/Completion循环；固定Chromium对合成门户和真实复兴银行门户均完成6/6。真实门户曾暴露异步资料加载竞态，生成器现以冻结超时等待可见，而不是瞬时`isVisible`误判。

尚未完成的是运行中 Agentflow 发布、真实 MiMo 主控对话、阶段5—7脚本交付/激活/调度/修复以及 HiAgent 目标环境验收。因此只能声明“阶段4本机代码、集成和真实门户浏览器验证完成”，不能声明“主控—视觉—脚本完整闭环”或“HiAgent已验收”。追踪见 `AUD-009...AUD-027`。

## 9. HiAgent 迁移约束

- Flowise Agentflow 节点逐项映射到 HiAgent 已证明的 Agent、Workflow、知识检索、变量、人工确认和 MCP 能力；
- Flowise 专有节点、内部 API、内部数据库行为、隐式记忆和异常吞并不得进入正式同源定义；
- Flowise 平台知识制品按来源、版本和 Hash 重新导入 HiAgent Knowledge，不复制 Flowise 数据库；
- `regression_platform.sqlite`、MCP 和本地执行工具契约保持不变，但在测试环境重新验证网络和鉴权；
- Flowise 成功只证明本机/办公电脑阶段，HiAgent 必须重新注册、调试、发布和验收。

## 10. 验收门禁

1. 每个 Workflow 节点都归属 Flowise 操作表或本地工具表，不存在第三种隐式执行；
2. Flowise 外的全部调用只经过 MCP；
3. Flowise 平台知识的每次关键查询都有版本、Hash 和引用；
4. Flowise SQLite 与 Harness SQLite 物理分离、权限分离、备份分离；
5. LLM 无法直接访问任一 SQLite、文件、Shell、凭据或浏览器；
6. 正式回归不调用 Flowise、HiAgent、LLM 或 Midscene；
7. 运行事实、人工决定和脚本激活只由 Harness 事务写入；
8. 双知识库不存在正文/状态双写，产品目录不存在自研 `rag/`、Embedding、Vector Store 或 Retriever 子系统；
9. Flowise 3.0.12、Node 20.20.2 和关键依赖固定，不浮动升级；
10. Flowise 到 HiAgent 的每项能力都有证据映射，未验证能力失败关闭。

## 11. 依据

- 本机 Flowise 探针：`platform/hengzhun-regression-system/probes/flowise/results/2026-07-20-windows-probe.md`。
- Flowise 官方数据库文档：<https://docs.flowiseai.com/configuration/databases>。
- Flowise 官方 Agentflow V2 文档：<https://docs.flowiseai.com/using-flowise/agentflowv2>。
- Flowise 官方 Document Stores 文档：<https://docs.flowiseai.com/using-flowise/document-stores>。
- Flowise 官方本地 Faiss 文档：<https://docs.flowiseai.com/integrations/langchain/vector-stores/faiss>。
