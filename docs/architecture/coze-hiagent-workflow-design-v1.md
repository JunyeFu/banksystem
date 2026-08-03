---
id: DOC-ARCH-COZE-HIAGENT-WORKFLOW-V1
title: Coze 模拟 HiAgent 能力边界的回归工作流设计 V1
document_type: design
domain: architecture
status: draft
authority: proposal
version: 0.4
effective_date: 2026-07-16
owner: project-owner
---

# Coze 模拟 HiAgent 能力边界的回归工作流设计 V1

> 本文是待项目负责人修改确认的首版实施设计，不是当前能力证明，也不改变 [`agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md) 的唯一实施顺序权威。本文恢复并落实 Coze 在演示系统中的主控 LLM 地位；Codex 只负责开发，不进入演示系统运行时。

## 1. 设计结论

演示系统采用以下单一主线：

```text
用户
-> Coze 自定义 Agent（唯一自然语言入口和主控 LLM）
-> Coze Knowledge Base / Skills / Workflow
-> 衡准回归 Harness OpenAPI Plugin
-> Harness 本机任务、状态机、安全门禁和 SQLite
-> Playwright Worker / Midscene 视觉 Agent
-> 复兴银行被测系统
-> Harness 证据和结果
-> Coze 对话返回
```

“完全按照 HiAgent 方式”在本项目中的含义是：HiAgent 是云端目标平台和最终能力边界，不在本机部署，也不把其源码、运行时或内部数据写入项目。Coze 只作为 HiAgent 的本机模拟平台；即使 Coze 原生提供更多能力，本演示系统也只能使用 HiAgent 2.5.1 帮助文档和现场界面照片能够证明的 Agent、知识库、Skills、工作流、插件、发布、鉴权、审批治理和可观测性能力。

Coze 是演示运行平台，但不是能力标准。HiAgent 云端平台才是能力标准；任何无法通过 HiAgent 公开界面上传、创建、导入、接入或配置的 Coze 能力，均不得进入设计和实现。

### 1.1 单目录产品边界

整个衡准自动化回归测试系统必须高度集成在一个目录：

```text
platform/hengzhun-regression-system/
```

该目录必须能够作为一个完整产品单元被复制、压缩、迁移、启动、停止、测试和验收。除复兴银行被测系统外，自动化回归系统不得再依赖仓库其他位置的运行时代码、测试、契约、配置或脚本。

仓库级架构文档可以在 `docs/` 保留权威索引，但该目录内部必须同时包含足以独立部署和维护的产品说明。仓库 `docs/`、`rag/` 仍不得成为产品运行时依赖。

## 2. 不可变边界

1. Coze 自定义 Agent 是唯一用户入口、唯一业务编排主体和主控 LLM。
2. Coze Knowledge Base 是交付系统运行时唯一知识权威；仓库 `docs/`、`rag/` 和 HiAgent 导入资料只供开发使用。
3. Harness 是确定性工具、安全、任务和状态层，不得演化为第二个会话 Agent。
4. `regression_platform.sqlite` 是案例、计划、运行、脚本、审批和证据元数据的唯一回归领域事实来源。
5. Midscene 是使用多模态模型的视觉操作 Agent；Playwright 是浏览器控制、确定性断言和正式回归执行底座。
6. 正式定时回归只能执行 `SCRIPT_VALIDATED` Playwright 脚本，不调用 Coze LLM、Midscene 或视觉模型。
7. 衡准继续暂停实现；未来只读展示指标和证据，不为 Coze Agent 提供能力。
8. 凭据、Cookie、Token、真实 PII、截图原件和完整日志不得进入 Coze 对话上下文或插件输出。
9. 自动化回归系统所有可执行资产、非敏感配置、契约、测试和部署入口必须位于 `platform/hengzhun-regression-system/`；禁止在仓库其他目录形成第二套平台实现。
10. Coze 只能模拟 HiAgent 已证明的公开能力，不得使用 Coze 私有 API、内部数据库、源码注入、容器目录挂载或隐藏管理接口获得 HiAgent 不具备的能力。
11. Skill 和工具只能通过 HiAgent 界面照片所示的公开方式注册；本地产品目录只生成可上传/可导入制品和操作说明，不能直接写入平台内部状态。

## 3. HiAgent 能力依据与项目映射

本节依据仓库中导入的 HiAgent 2.5.1 帮助文档。导入资料自身声明为外部参考，因此不能覆盖本项目现行架构和契约。

| HiAgent 已证明能力 | 本项目实现 | 边界 |
|---|---|---|
| 自然语言创建/使用智能体，编排知识库、工作流、插件 | 在 Coze 创建“衡准回归主控 Agent” | 不创建第二个 HiAgent Agent |
| 对话型和规划协作型 Agent 可使用 Skills | 在 Coze 以提示词/技能模块固化需求澄清、案例规划、失败解释规则 | Skill 不持久化案例状态 |
| 自定义 API 插件可由 OpenAPI 导入并调试、发布 | Harness 提供版本化 OpenAPI，导入 Coze 作为唯一工具插件 | 不开放 Shell、数据库和任意 URL 工具 |
| 插件支持 API Key/Bearer 等受控鉴权 | Coze 到 Harness 使用服务令牌和本机网络 allowlist | 密钥只在部署配置中注入 |
| 插件可设置 1–30 分钟超时，默认 1 分钟 | 所有浏览器长任务采用提交后查询的异步协议 | Coze 工具调用不阻塞等待完整回归 |
| 模型会把工具调用栈输出聚合进上下文；Function Call 更节省上下文 | 插件只返回短摘要、状态和不透明 ID | 不返回截图、视频、HTML、全量日志 |
| 智能体发布后支持会话、消息和变量传参 | Coze 会话变量只保存 `namespace` 和对象引用 | 会话变量不是领域事实来源 |
| 平台支持发布审核、插件/Skill 上架审核和第三方审核回调 | 借鉴“草稿—验证—人工确认—发布”的治理模式 | HiAgent 审批中心不等于测试脚本业务审批 |
| 支持 Agent/Model 指标、链路追踪、会话和日志 | Harness 生成可关联的 run/task/tool/action 事件和指标 | 运行事实最终写入 SQLite/Artifact 元数据 |
| 团队空间共享 Agent、插件、Skill、工作流和知识库并实施访问控制 | Coze 资产按演示项目空间隔离，插件最小权限 | 不跨项目共享银行凭据或案例数据 |

### 3.1 现场界面确认的注册能力

现场照片进一步冻结以下能力边界，Coze 模拟实现必须逐项遵守：

| 资源 | HiAgent 公开入口 | 已确认限制 | 本项目选择 |
|---|---|---|---|
| Skill | “本地上传 Skill” | 只接受 `.zip`、`.skill`；单个文件不超过 10 MiB | 生成 `.skill` 和校验清单，由用户在界面上传 |
| API 插件 | “创建插件—基于已有服务创建” | 填写名称、描述、Logo、插件 URL、Header 和授权方式 | Harness 作为已有服务，使用标准 Bearer Token |
| 插件导入 | “导入插件” | 支持 OpenAPI 导入和 DSL 导入 | 首版只使用 OpenAPI 导入 |
| MCP 插件 | “接入 MCP 插件” | 照片界面提示仅支持 2025-03-26 及之前版本的 MCP 协议 | I1–I3 不使用 MCP；后续仅在兼容性实测通过后启用 |
| 鉴权 | 创建插件的授权方式 | 界面提供无认证、Basic Auth、Bearer Token、API Key、OAuth2 | 首版固定 Bearer Token，禁止无认证 |

插件创建界面还显示名称、描述、Logo、URL、Header 列表等公开配置项。本项目不得依赖这些字段以外的隐式注入，也不得假设云端 HiAgent 能访问本机 `127.0.0.1`；实际迁移时必须把 Harness 部署到 HiAgent 可达且受控的网络地址。

### 3.2 明确不依赖的能力

当前导入包没有提供独立的“工作流”详细帮助正文，也没有给出可据以编码的节点类型、循环、并行、补偿或持久任务语义。因此：

- Coze Workflow 只承担对话入口、知识检索、模型判断和工具调用顺序；
- 分支、重试、幂等、租约、并发、补偿、恢复和状态迁移全部由 Harness 显式状态机实现；
- 不以“平台应该有某个工作流节点”为实现前提；
- Coze 资产最终配置必须通过实际 Coze Studio 能力检查后再冻结。
- 不使用 Coze 独有而 HiAgent 资料和现场界面无法证明的节点、变量类型、触发器、内置工具或自动发布接口；
- 不通过脚本直接写入 Coze/HiAgent 内部数据库，不通过容器挂载把 Skill 或插件“自动安装”进平台；
- 不把本地 Shell、文件系统、Docker、SQLite、Playwright 或 Midscene 分别注册为平台工具。

## 4. Coze 资产设计

### 4.1 主控 Agent

唯一运行时 Agent 名称暂定为“衡准自动化回归主控 Agent”。其职责是：

1. 接收自然语言回归目标；
2. 从 Coze Knowledge Base 获取业务术语、页面规则、案例模板和安全规则；
3. 澄清缺失信息并形成结构化案例草稿；
4. 选择允许的 Harness 工具并传入最小参数；
5. 用 `taskId` 查询任务状态；
6. 用自然语言解释结果、证据摘要和下一步；
7. 在脚本激活、Schedule 恢复等受控动作前取得用户明确确认。

主控 Agent 不得直接：

- 操作浏览器、文件系统、数据库或 Docker；
- 持有复兴银行账号密码；
- 直接调用 Midscene 或 Playwright；
- 修改正式脚本、基线和调度状态；
- 将聊天记录作为案例或运行结果的权威副本。

### 4.2 Coze Knowledge Base

首版建立四类运行时资料集：

| 资料集 | 内容 | 首版是否必需 |
|---|---|---|
| `regression-policy` | 风险等级、禁止动作、人工确认、证据和脱敏规则 | 是 |
| `case-authoring` | 案例字段、前置条件、动作、断言、错误语义和示例 | 是 |
| `fuxing-portal` | 首批门户路由、可见功能、测试角色和公开业务语义 | 是 |
| `failure-taxonomy` | 环境、认证、契约、定位器、断言、模型和工具失败分类 | 是 |

知识正文只存在于 Coze Knowledge Base。Harness 只记录 `knowledgeSpaceRef`、`datasetRef`、版本标识、检索请求 Hash 和命中结果 Hash，不复制正文。

### 4.3 Skills

首版只定义三个可复用技能：

1. `normalize-regression-request`：把自然语言目标整理为案例草稿，发现缺项时只生成澄清问题；
2. `select-execution-route`：根据案例状态和风险选择 Playwright、Midscene 作者化或人工确认；
3. `explain-regression-result`：把 Harness 的结构化结果解释为简洁、可追溯的中文报告。

Skills 只能加工输入输出和选择工具，不能绕过 Harness 门禁或直接改变权威状态。

每个 Skill 必须能够打包为 HiAgent 界面可接受的 `.skill` 或 `.zip` 文件，单包不得超过 10 MiB，并通过界面手工上传、调试和发布。Coze 是否能直接接收同一制品、解析相同目录并保持等价执行语义，必须先通过 [`PLAT-V001`、`PLAT-V002`](../current-state/coze-hiagent-verification-register.md)；验证前只能声明“同源设计”，不得声明“同一制品已可迁移”。不得通过 Coze 专属代码插件扩展 Skill 权限。

产品目录保存 Skill 源文件、构建脚本、产物 Hash 和上传说明，但“产物已生成”不代表“平台已安装”。只有界面上传成功、调试通过并发布后才能标记为可用。

### 4.4 会话变量

Coze 会话最多保存以下轻量引用：

```json
{
  "namespace": "demo-local",
  "caseId": "opaque-id",
  "caseVersion": 1,
  "taskId": "opaque-id",
  "runId": "opaque-id",
  "pendingDecisionId": "opaque-id"
}
```

禁止保存案例全文、完整动作历史、截图、视频、日志、Token、账号密码、Cookie、Storage State 和数据库路径。每次继续任务时必须通过 Harness 按 ID 重新读取当前状态，避免 Coze 会话与 SQLite 分叉。

## 5. Harness Plugin 设计

### 5.1 接入方式

Harness 暴露受控的 HTTPS/HTTP OpenAPI 服务，由 Coze 通过与 HiAgent 相同的“导入插件—OpenAPI 导入”公开界面注册。首版使用 Function Call 工具模式和标准 Bearer Token；令牌只在平台授权配置中填写，日志只记录凭据指纹，不记录凭据值。插件契约、Harness 服务和可导入制品均由同一产品目录管理。

不得通过 Coze 私有 API 自动创建插件，不得修改 Coze 数据库，不得把 Harness 源码挂载到 Coze 容器内部。Coze 与未来 HiAgent 都只能看到 OpenAPI 暴露的工具，不得感知 Harness 内部的 Playwright、Midscene、SQLite 和文件路径。

所有修改类请求必须携带：

- `namespace`；
- `idempotencyKey`；
- 预期对象版本；
- Coze 会话/消息关联 ID（若平台可提供）；
- 用户确认引用（仅受控操作）。

### 5.2 最小工具集

| 工具 | 用途 | 是否长任务 | 核心返回 |
|---|---|---:|---|
| `case_create_draft` | 保存结构化案例草稿 | 否 | `caseId`、`version`、校验问题 |
| `case_get` | 获取当前案例摘要和状态 | 否 | 版本、状态、短摘要 |
| `plan_compile` | 生成确定性执行计划或作者化任务 | 是 | `taskId` |
| `run_submit` | 提交已允许的案例执行 | 是 | `taskId`、`runId` |
| `task_get` | 查询计划/执行/验证任务 | 否 | 状态、进度、错误分类、结果引用 |
| `artifact_get_metadata` | 获取证据元数据和受控预览引用 | 否 | 类型、Hash、脱敏状态、受控 ID |
| `decision_submit` | 提交脚本激活或恢复决定 | 否 | 决定状态、新版本 |

工具描述必须明确何时允许调用、何时禁止调用、所需参数和短返回结构，避免模型因描述模糊重复调用。

七个工具统一收敛在一个“衡准回归 Harness”API 插件中，不将每个内部组件拆成独立插件。OpenAPI 文件必须能够直接通过照片所示的 OpenAPI 导入入口创建单个插件。

### 5.3 异步任务协议

浏览器、Midscene、视频处理和脚本验证不得在一次插件调用内长时间阻塞：

```text
Coze -> run_submit
Harness -> 202 + taskId + runId
Coze -> task_get(taskId)
Harness -> QUEUED/RUNNING/WAITING_USER/SUCCEEDED/FAILED
Coze -> 向用户解释或请求决定
```

首版不依赖插件流式输出。Coze 应使用有上限的轮询：前台交互最多查询 6 次，采用 2、3、5、8、13、20 秒退避；超过窗口后告知用户任务仍在运行，并允许用户稍后以 `taskId` 继续。Harness 任务不会因 Coze 会话中断而丢失。

### 5.4 工具返回预算

工具输出采用分级预算，不再使用统一 4 KiB 限制。预算按完整 JSON 响应体经过 UTF-8 序列化后的字节数计算，不含 HTTP Header，压缩前计量。实现时统一使用与 `Buffer.byteLength(JSON.stringify(body), 'utf8')` 等价的算法。

| 等级 | 适用返回 | 默认目标 | 单次上限 | 超限处理 |
|---|---|---:|---:|---|
| L0 状态 | 任务状态、轮询心跳、短错误 | 4 KiB | 8 KiB | 只保留状态、短摘要、错误码和对象引用 |
| L1 回执 | 创建、提交、决策确认、异步受理 | 8 KiB | 16 KiB | 省略重复输入，详细内容转对象引用 |
| L2 详情 | 案例详情、计划摘要、失败诊断、结构化发现 | 32 KiB | 64 KiB | 列表分页；完整诊断转 Artifact |
| L3 元数据 | Artifact 元数据清单、证据索引 | 64 KiB | 128 KiB | 强制分页，只返回元数据，不内联制品内容 |

七个工具的固定等级如下：

| 工具 | 输出等级 | 约束 |
|---|---|---|
| `case_create_draft` | L1 | 返回案例标识、版本、状态和校验摘要 |
| `case_get` | L2 | 案例步骤和发现项分页，不返回历史运行全集 |
| `plan_compile` | L1 | 只返回异步受理回执和 `taskId`，计划正文通过后续引用取得 |
| `run_submit` | L1 | 返回 `runId`、`taskId`、受理状态和幂等结果 |
| `task_get` | L0 | 仅用于状态轮询；完成结果返回摘要及结果/Artifact 引用 |
| `decision_submit` | L1 | 返回决定记录、对象版本和后续状态，不重复候选正文 |
| `artifact_get_metadata` | L3 | 只返回脱敏元数据并强制分页，不返回文件字节或大段文本 |

预算治理规则：

1. 128 KiB 是 Harness 应用层绝对硬上限；任何工具不得通过参数绕过。调整上限必须修改版本化 OpenAPI 契约并重新完成兼容与安全评审。
2. HiAgent 2.5.1 文档记录的插件输出平台上限为 2 MiB；它只作为最终平台兼容防线，不作为 Harness 可用预算。
3. 列表响应必须支持 `nextCursor`；达到等级上限时在完整条目边界停止，设置 `truncated=true`，禁止截断 JSON 字段、UTF-8 字符或单条记录。
4. 完整日志、网络包、HTML、截图、视频、脚本正文和长诊断必须保存到 Artifact 存储，只返回 `artifactId`、类型、Hash、大小和受控获取信息。
5. 正常响应默认只包含 1 个主状态、1 个短摘要、当前工具产生的结构化结果和对象引用，不得嵌套其他工具的历史结果。
6. 错误响应必须保持 `errorCode`、`category`、`retryable`、`userActionRequired`；即使发生预算错误也不得退化为无结构文本。
7. 超过 L0–L3 单次上限但能够分页或转 Artifact 时返回成功的部分结果；无法安全降级时返回稳定的 `OUTPUT_BUDGET_EXCEEDED`，不得把超限响应发送给平台。

## 6. 首个纵向工作流

首版只落地“客户账号密码登录与个人资料一致性”闭环，对应实施批次 I3。

### 6.1 正常流程

```text
1. 用户在 Coze 输入：验证客户账号密码登录后，右上角姓名与个人资料一致。
2. Coze 检索运行时知识并执行 normalize-regression-request。
3. 缺少环境或测试身份时，Coze 只询问必要问题；测试凭据由 Harness 凭据别名解析。
4. Coze 调用 case_create_draft。
5. Harness 校验路由、前置条件、风险、断言和凭据别名，写入 SQLite。
6. Coze 调用 plan_compile；Harness 生成任务并返回 taskId。
7. Coze 轮询 task_get，取得可执行计划摘要。
8. Coze 调用 run_submit。
9. Harness 为 runId 创建独立 BrowserContext，准备合成 Fixture。
10. Playwright 打开门户、在门户页面完成账号密码登录并断言跳转。
11. Playwright 读取右上角姓名、头像可见状态和个人资料页姓名，执行一致性断言。
12. Harness 采集脱敏截图、断言、网络摘要、日志和 Hash，完成运行状态。
13. Coze 通过 task_get 和 artifact_get_metadata 获取短结果。
14. Coze 执行 explain-regression-result，向用户返回通过/失败、证据编号和建议。
```

### 6.2 首版执行路由

该案例已有稳定 Playwright 脚本时，直接执行 Playwright。没有稳定脚本或定位器失效时，状态进入 `AUTHORING_REQUIRED`，只能在后续 I4 通过 Harness 调用 Midscene 作者化；不得在 I3 暗中让 LLM 替代确定性脚本。

### 6.3 状态机

```text
DRAFT
-> VALIDATED
-> PLAN_COMPILING
-> READY
-> RUN_QUEUED
-> RUNNING
-> PASSED | FAILED | BLOCKED

无可用脚本：VALIDATED -> AUTHORING_REQUIRED
需人工确认：任意受控节点 -> WAITING_USER -> 原流程或 CANCELLED
```

状态迁移只由 Harness 完成。Coze 只能请求迁移并展示结果。

## 7. Midscene 与 Playwright 的后续接入

I4 接入 Midscene 时仍遵守现行三动作窗口：Harness 每次只提供上一动作摘要、当前动作完整定义、下一动作预告、当前截图和页面状态。Midscene 使用已验证的多模态模型 Profile，不能读取完整案例库和历史日志。

路由规则：

| 场景 | 执行者 |
|---|---|
| 已验证脚本的正常回归 | Playwright |
| LOW/MEDIUM 定位器作者化 | Harness 调度 Midscene，Playwright 取证和断言 |
| HIGH 风险提交 | Midscene 只定位，Playwright 唯一性检查和提交 |
| 正式定时回归 | 仅 Playwright |

### 7.1 MiMo v2.5 实测边界（2026-07-16）

在固定 Node 20.20.2、Midscene 1.10.5、Playwright 1.59.1 和 Chromium revision 1217 的本机运行时中，对复兴银行门户登录页完成了真实浏览器作者化测试。模型配置为 MiMo v2.5，测试只填写合成用户名，不填写密码、不点击登录、不提交表单，并由 Playwright 独立检查 DOM 值、URL、错误提示、请求方法和定位框重合度。

| 运行 | 分辨率与动作 | 结果 | 关键证据 |
|---|---|---|---|
| `midscene-authoring-stability-2026-07-16T08-15-48-182Z` | 5 种分辨率，开放式 `aiAct` | 4/5 通过 | 1024×768 时将输入动作错误落在登录方式页签，且模型错误自报成功 |
| `midscene-authoring-stability-2026-07-16T08-19-02-725Z` | 1024×768，开放式 `aiAct` 连续 3 次 | 0/3 通过 | 1 次未写入，2 次超过 20 次重规划限制 |
| `midscene-authoring-stability-2026-07-16T08-24-30-690Z` | 1024×768，原子 `aiInput` 连续 3 次 | 3/3 通过 | 中位耗时 11.534 秒，最大 11.740 秒，用户名最小 IoU 0.5823，按钮最小 IoU 0.9031，无非只读请求 |

因此 I4 不得把开放式 `aiAct` 的成功返回视为动作成功，也不得让其直接完成写入、提交或发布。首版作者化必须遵守：

1. 优先使用 `aiLocate`、`aiInput`、`aiTap` 等单一意图原子接口，不把多步骤自然语言交给一次 `aiAct`；
2. 每个原子动作后由 Playwright 读取 DOM、URL、网络请求和业务状态进行确定性复核；
3. 复核失败即停止当前动作链，保存脱敏证据并转入重试或 `WAITING_USER`，禁止依据 Midscene 的自然语言自报结果继续执行；
4. 提交、转账、审批、删除、发布等 HIGH 风险动作仍由 Playwright 在唯一性检查和人工门禁后执行；
5. MiMo v2.5 当前只能评定为“受控原子作者化可用”，不能评定为“开放式自主浏览器操作稳定”。

上述运行产物保存在本机 `output/playwright/<runId>/`，属于可再生测试证据，不进入产品提交。

## 8. 人工确认与发布治理

HiAgent 审批中心证明了资源发布前审核和第三方审核对接模式，但没有证明其可直接审批本项目的案例或脚本。因此本项目采用等价但独立的业务门禁：

1. Coze 展示候选版本、变化摘要、验证结果和风险；
2. 用户在 Coze 中明确输入同意/拒绝；
3. Coze 将 `pendingDecisionId`、选择和幂等键传给 `decision_submit`；
4. Harness 验证决定仍有效且版本未变化；
5. Harness 写入审批记录并执行激活或拒绝；
6. Coze 重新读取状态并报告结果。

必须人工确认的首批动作包括：脚本候选激活、基线更新、Schedule 恢复和任何 HIGH 风险动作。Coze 不得替用户自动确认。

## 9. 安全设计

- Coze Plugin 只访问 Harness 单一地址，Harness 只允许固定来源和版本化路径。
- Coze/HiAgent 插件固定使用公开支持的 Bearer Token 鉴权；禁止无认证接入。
- 工具参数采用 JSON Schema 严格校验，拒绝未知字段、任意 URL、任意路径和命令片段。
- 银行账号使用 `credentialAlias`，由 Harness 本机凭据存储解析；Coze 不接收明文。
- Artifact 访问使用短期受控引用；路径不进入对话。
- 所有写请求均要求幂等键、对象版本和审计主体。
- 工具调试样例不得包含敏感信息，避免被保存为公开示例。
- 外部视觉模型只接收本机脱敏后的最小截图；正式脚本运行不发送截图给模型。
- 任何需要本地文件、数据库、浏览器或 Docker 权限的操作都封装在 Harness 内部，Coze/HiAgent 只能通过七个受控 API 工具间接请求。

## 10. 可观测性设计

沿用 HiAgent 的 Agent/Model 指标与链路追踪思路，但由本机 Harness 产生可验证数据：

| 层级 | 关联标识 | 首版指标/事件 |
|---|---|---|
| Coze 会话 | `conversationRef`、`messageRef` | 请求数、工具选择、响应耗时、Token（平台可提供时） |
| Plugin 调用 | `toolCallId`、`taskId` | 工具、耗时、成功率、错误码、重试次数 |
| Harness 任务 | `taskId`、`runId` | 排队、运行、等待、完成、失败分类 |
| 浏览器动作 | `actionId`、`runId` | URL、断言、耗时、证据引用，不记录敏感输入 |
| Artifact | `artifactId` | 类型、Hash、大小、脱敏状态、保留策略 |

所有层级必须能由 `runId` 关联。衡准恢复开发后只能读取这些投影，不回写任务状态。

## 11. 失败与恢复规则

| 失败 | Harness 行为 | Coze 行为 |
|---|---|---|
| 参数/契约错误 | 立即拒绝，不创建运行 | 解释缺项并重新澄清 |
| 环境不可用 | 标记 `BLOCKED`，保留诊断证据 | 告知环境根因，不伪报测试失败 |
| 认证失败 | 分类为测试失败或 Fixture 失败 | 返回脱敏摘要，不展示凭据 |
| 定位器失效 | 标记 `AUTHORING_REQUIRED` | 建议进入 I4 作者化，不自动改正式脚本 |
| 插件调用超时 | 后台任务继续，状态可查询 | 使用 taskId 恢复，不重复提交 |
| Coze 会话中断 | 任务和状态保持在 SQLite | 新会话按 taskId/runId 继续 |
| 证据不完整 | 运行不得判为可交付通过 | 明确报告证据门禁失败 |

## 12. 单目录集成布局

项目负责人确认本文后，自动化回归系统统一建设在以下目录，不再把平台代码、契约和测试分散到仓库级 `contracts/`、`tests/`、`config/` 或其他目录：

```text
platform/hengzhun-regression-system/
├── README.md                     产品入口、边界、启动和验收说明
├── package.json                  单一 Node 工作区入口
├── compose.yaml                  Coze、Harness、Worker 与本机网络编排
├── .env.example                  仅变量名和非敏感示例
├── runtime/                      固定 Node、Playwright、Midscene、Chromium 运行时
├── coze/
│   ├── agent/                    仅公开界面可配置的主控 Agent 配置清单
│   ├── workflows/                仅 HiAgent 已证明能力范围内的 Workflow 配置清单
│   ├── skills/                   Skill 源、.skill/.zip 制品、Hash 和上传说明
│   ├── knowledge/                KB 目录结构、清单和迁移工具，不保存运行时权威副本
│   ├── plugins/                  OpenAPI 导入包、Logo、字段清单和注册说明
│   └── conformance/              Coze 对 HiAgent 能力边界的一致性测试
├── harness/
│   ├── src/                      API、安全、状态机、任务和审计
│   ├── migrations/               regression_platform.sqlite 迁移
│   └── test/                     Harness 单元测试
├── worker/
│   ├── playwright/               确定性执行和正式回归
│   ├── midscene/                 视觉作者化和三动作窗口适配
│   └── test/                     Worker 单元测试
├── contracts/
│   └── openapi/harness-api.yaml  Coze 到 Harness 的唯一公开契约
├── tests/
│   ├── contract/                 OpenAPI、Schema 和错误语义
│   ├── integration/              SQLite、任务、幂等和 Worker 联调
│   └── e2e/                      Coze 到复兴银行的纵向闭环
├── scripts/
│   ├── bootstrap.*               一键准备
│   ├── start.*                   一键启动
│   ├── stop.*                    安全停止本产品服务
│   ├── verify.*                  一键完整验证
│   └── package-offline.*         后续封闭内网迁移包
├── docs/                         产品内部部署、运维、契约和故障处理说明
└── .data/                        本机运行态根目录，整体禁止入库
    ├── sqlite/
    ├── artifacts/
    ├── coze/
    ├── browser-profiles/
    ├── logs/
    └── tmp/
```

现有 `platform/runtime/` 在实施 I1 时迁移到 `platform/hengzhun-regression-system/runtime/`，验证新入口可用后再删除旧位置，禁止长期保留两套运行时。

### 12.1 允许的目录外依赖

只有以下依赖可以位于产品目录之外：

1. 复兴银行被测系统的应用、接口和 Docker 服务；
2. 操作系统、Docker Desktop 和外部大模型 API；
3. 仓库级 `docs/` 中的架构权威和实施顺序文档；
4. Git、Node/npm 等开发基础设施。
5. 作为能力标准和未来迁移目标的云端 HiAgent；它不是本地运行依赖，不在产品目录保存其源码或运行数据。

运行时不得读取仓库级 `docs/`、`rag/`、`agent/`、通用 `contracts/` 或通用 `tests/`。需要使用的契约、测试和非敏感配置必须归档到产品目录内，并由该目录自己的版本和校验入口管理。

### 12.2 单目录启动与验证

产品目录必须提供一组统一入口，Windows 下至少支持：

```text
scripts/bootstrap.cmd
scripts/start.cmd
scripts/stop.cmd
scripts/verify.cmd
```

所有命令必须在 `platform/hengzhun-regression-system/` 内执行，不要求调用仓库其他位置脚本。`verify.cmd` 至少覆盖运行时版本、OpenAPI、单元测试、SQLite 迁移与完整性、Harness/Worker 集成、Coze Plugin 连通性和首个 E2E 案例。

### 12.3 运行态隔离

`.env`、数据库文件、WAL/SHM、浏览器 Profile、Coze 运行数据、Worker 临时目录、截图、视频、日志和缓存统一写入产品目录内的 `.data/` 或部署时显式指定的同结构受管目录，并整体禁止入库。源码不得把运行态写回其他仓库目录。

### 12.4 平台制品与注册状态分离

单目录集成指本地可执行系统和所有可迁移制品集中管理，不代表把 HiAgent 云端平台复制到本地。产品目录只保存：

- 可由公开界面上传的 `.skill`/`.zip`；
- 可由公开界面导入的 OpenAPI 插件文件；
- Logo、字段映射、授权配置说明和制品 Hash；
- Agent、Workflow、Knowledge Base 的公开界面配置清单；
- Coze 与 HiAgent 能力一致性验收记录。

平台内实际的 Agent、Skill、插件和知识库注册状态由各平台自身管理。禁止用本地文件存在替代平台发布成功证据。

## 13. 首版验收标准

只有同时满足以下条件，才可称为 I3 首个闭环完成：

1. 用户只通过 Coze 自然语言入口发起测试；
2. Coze 只经已发布的 Harness Plugin 使用工具；
3. 案例与运行状态只存在于 `regression_platform.sqlite` 权威模型；
4. 相同幂等键不会创建重复案例或重复运行；
5. 插件长任务返回 taskId，Coze 会话中断后可恢复查询；
6. 客户账号密码在门户页面完成登录，不跳到 Keycloak 页面输入；
7. 右上角姓名与个人资料姓名由真实当前用户数据产生并一致；
8. Playwright 断言、脱敏截图和日志 Hash 可由同一 runId 关联；
9. 工具输出不含账号密码、Cookie、Token、真实 PII 和本机绝对敏感路径；
10. 成功、测试失败、环境阻塞和证据不完整四类结果能够区分；
11. 相关单元、契约、集成和 E2E 测试通过；
12. 正式脚本未经过验证和人工门禁时不能标记为 `SCRIPT_VALIDATED`。
13. 从 `platform/hengzhun-regression-system/` 执行单一启动和验证入口即可完成系统启动与 I3 验收。
14. 暂时移走仓库其他平台目录后，除复兴银行被测系统外，衡准回归系统仍不存在代码、契约或测试缺失。
15. 三个 Skill 均可打包为不超过 10 MiB 的 `.skill`/`.zip`，并通过公开界面上传、调试和发布。
16. Harness OpenAPI 可通过公开的 OpenAPI 导入入口创建单个插件，使用 Bearer Token 后七个工具均能真实调用。
17. Coze 未使用任何无法在 HiAgent 帮助文档或现场界面中证明的额外能力；发现越界即验收失败。
18. 不修改 Coze/HiAgent 数据库、不挂载内部代码、不调用私有管理 API，也不把本地高权限组件直接暴露为工具。
19. 七个工具按 L0–L3 预算返回，分页与 Artifact 降级可验证，任何响应均不超过 128 KiB Harness 硬上限。

## 14. 后置范围

以下内容不进入首版 I3：

- 视频案例导入与本机拆帧；
- 其他平台案例适配器；
- Midscene 自动作者化和三动作窗口实现；
- 脚本失效后的自动修复候选；
- Schedule、misfire、补跑和离线迁移包；
- 衡准只读观测界面；
- 转账、贷款、日终和运营审批案例。

它们分别在 I4–I6 追加，不反向改变本文的 Coze 单主控、Harness 单事实源和正式回归仅 Playwright 的边界。

## 15. 待负责人修改确认项

平台产品行为、限制数字和迁移条件的待验证状态统一以 [`Coze 模拟 HiAgent 平台能力待验证登记册`](../current-state/coze-hiagent-verification-register.md) 为准。附件文本、模型回答或二手调研不能关闭登记项；某项失败只阻塞其依赖批次。

首版默认值如下，负责人可直接修改：

1. Coze Agent 显示名是否采用“衡准自动化回归主控 Agent”；
2. 四个 Knowledge Base 资料集是否合并为一个库内四个目录；
3. Coze 前台任务轮询上限是否保持 6 次；
4. 已确认：插件返回采用 L0–L3 分级预算，Harness 硬上限 128 KiB，平台兼容上限 2 MiB；
5. 首个案例是否保持“客户账号密码登录与个人资料一致性”；
6. `decision_submit` 在 I3 仅实现协议占位，还是同时实现脚本激活门禁。
7. 单目录正式名称是否确认使用 `platform/hengzhun-regression-system/`。
8. 首版固定使用 OpenAPI 导入 + Bearer Token，不使用 DSL 和 MCP。

## 16. 参考的 HiAgent 本地资料

- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/HiAgent介绍.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/Skills.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/插件.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/常见问题/异常问题/插件.md`（插件输出 2 MiB 平台上限依据）
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/审批中心.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/团队空间.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/API & SDK/HiAgent OpenAPI通用说明.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/API & SDK/HiAgent接口列表概览.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/API & SDK/平台接口/观测指标接口.md`
- `knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/常见问题/使用咨询/插件.md`
