---
id: DOC-ARCH-HIAGENT-FLOWISE-CAPABILITY-BOUNDARY-V1
title: HiAgent 2.5.1 与 Flowise 能力边界及迁移适配基线
document_type: architecture-baseline
domain: regression-platform
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-27
owner: project-owner
---

# HiAgent 2.5.1 与 Flowise 能力边界及迁移适配基线

> 本文是 HiAgent 帮助资料、实际平台截图与当前 Flowise 制品对照后的能力边界基线。它不建立新的实施顺序；先后关系只看 [`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md)，任务状态只看 [`agent/backlog.yaml`](../../../agent/backlog.yaml)。

## 1. 证据与结论等级

| 来源 | 用途 | 结论等级 |
|---|---|---|
| `docs/reference/hiagent-2.5.1-help/` | 原始帮助资料归档 | 外部参考 |
| `docs/reference/hiagent-2.5.1-help/readable/HiAgent介绍.txt`、`Agent Dev.txt`、`插件.txt` | 可检索的 UTF-8 阅读镜像 | 设计依据 |
| 用户提供的 HiAgent 工作流节点截图 | 核对真实界面节点分类 | 运行时界面证据，仍需目标租户复验 |
| `flowise/i10/agentflow-v4.json` | 当前 Flowise 节点事实 | 本机实现证据，不等同 HiAgent 能力 |

已确认、可用于迁移设计的 HiAgent 节点语义包括：大模型、智能体、代码、选择器、意图识别、变量聚合、循环、批处理、知识库检索/写入、问答库、术语库、长期记忆、数据库、工作流、插件、HTTP 请求、文本处理、消息、信息收集以及图像/视频生成。目标 HiAgent 租户仍需逐项重新注册、调试和发布。

截至本基线，没有帮助文档或截图证据证明 HiAgent 提供名为 `Human Input` 的原生节点，也没有证明固定的 `proceed/reject` 按钮合同。`Human Input`、`Proceed` 和 `Reject` 是 Flowise Agentflow 的本机交互能力，不能写成 HiAgent 原生能力。

## 2. 强制边界编号

| 编号 | 固化规则 | 失败动作 |
|---|---|---|
| `HIA-CAP-001` | HiAgent 能力以帮助资料和目标租户实际界面/接口为准；Flowise 本机成功不构成 HiAgent 证明。 | 标记 `UNVERIFIED`，阻止迁移主张 |
| `HIA-CAP-002` | Flowise `humanInputAgentflow` 只可作为本机演示适配器；业务合同必须抽象为“消息 + 信息收集 + 选择器/条件 + 状态回流”。 | 禁止将节点名或按钮名写入跨平台合同 |
| `HIA-CAP-003` | 需要用户补充文字时，使用信息收集语义；需要用户确认时，使用消息说明、信息收集结果和选择器/条件分支组合。 | 不得依赖 Flowise 专属按钮行为 |
| `HIA-CAP-004` | HiAgent 平台外工具只能通过已注册插件/MCP访问；STDIO 工具运行在 HiAgent 平台环境，SSE/StreamableHTTP 属于远程服务。 | 不得假设 HiAgent 可访问个人电脑 `127.0.0.1` |
| `HIA-CAP-005` | Midscene/MiMo 是本地 Worker 的视觉作者化链，不是已证明的 HiAgent 原生视觉节点；迁移时必须作为注册插件或远程 MCP 能力重新验证。 | 不得把 Flowise 视觉探针写成 HiAgent 验收 |
| `HIA-CAP-006` | Skill 必须按 HiAgent 的上传、调试、发布生命周期注册；本地 `.skill/.zip` 文件存在不等于平台已安装。 | 缺少发布回读时保持 `UNVERIFIED` |
| `HIA-CAP-007` | HiAgent 具备的节点能力只能按能力交集进入同源 Workflow；Flowise 独有节点只能存在于本机适配层。 | 静态映射校验失败关闭 |
| `HIA-CAP-008` | HiAgent 无法原生承担本机回环访问、Windows 运行时控制、Flowise 内部数据库迁移或便携文件夹运行时。 | 当前 Flowise 项目不阻断；仅在 HiAgent 迁移阶段登记为外部 MCP/重建/部署事项 |

## 3. Flowise 到 HiAgent 的适配表

| Flowise 当前节点/行为 | HiAgent 对应语义 | 迁移规则 |
|---|---|---|
| `startAgentflow`、LLM、Agent、Condition、Loop、Iteration、Tool | 大模型、智能体、选择器、循环、工作流、插件 | 可按同义语义迁移，仍需目标租户验收 |
| `humanInputAgentflow` 的暂停/继续/拒绝 | 信息收集 + 消息 + 选择器/条件 + 旅程状态 | 仅保留业务语义，不迁移节点名和按钮名 |
| `directReplyAgentflow` | 消息 | 输出改为人类可读简报，不依赖 Flowise 专属渲染 |
| Flowise Knowledge/Retriever | 知识库检索/写入、问答库、术语库 | 只迁移来源、版本、Hash 和引用语义，不迁移内部数据库或索引 |
| `customMCP`/Tool | 插件或 MCP | 必须在 HiAgent 重新注册、鉴权、调试、发布 |
| HTTP/Code/文件/SQLite/浏览器直接调用 | 无可接受的跨平台等价边界 | 不进入正式同源流程；本机也必须由 MCP 封装 |
| Midscene/MiMo 视觉作者化 | 未证明为原生 Agentflow 视觉节点 | 保留为外部 Worker/MCP，单独验收 |

## 4. 交互合同

跨平台业务合同只允许以下三种模式：

- `STATUS_ONLY`：消息节点返回状态、结果或失败摘要。
- `INPUT_REQUIRED`：信息收集节点接收自然语言补充；主控结构化后由确定性 Harness 校验。
- `CONFIRM_EXACT`：消息展示唯一冻结方案，信息收集得到批准/拒绝值，选择器/条件决定回流或执行。

Flowise 本机可以把 `CONFIRM_EXACT` 渲染为 `proceed/reject`，但 Agent 必须在文字中解释本次按钮效果；迁移到 HiAgent 时改用“确认值 + 选择器/条件”表达。任何平台都不得让 `proceed` 自动选择 `allowedActions[0]`，也不得把自由文本确认直接接到变更状态的 MCP。

## 5. 网络与运行边界

个人电脑 Flowise 可以通过回环地址调用本机受控 MCP，仅证明本机演示链路。HiAgent 云端/测试环境能否访问本地 Harness 未被本基线假设；目标环境必须提供可达域名、企业私网连接或远程 MCP 服务，并重新完成 TLS、Bearer、来源和超时验收。任何 `127.0.0.1`、本机绝对路径、Flowise SQLite 或 Worker 进程句柄都不得写入迁移制品。

## 6. 迁移门禁

迁移前必须形成逐节点映射清单，至少包含 `flowiseNodeType`、`hiagentSemanticType`、`evidenceRef`、`status`、`fallback` 和 `revalidationSteps`。任一节点状态不是 `VERIFIED`，只能生成迁移待办，不得标记 HiAgent 可运行。HiAgent 目标租户必须重新完成 Skill 上传/调试/发布、插件/MCP 注册、Workflow 发布、真实调用和结果回读。

## 7. 当前项目非阻断声明

以下四项是已确认的平台边界，但不阻断当前 Flowise/Harness/Midscene/Playwright 项目：

1. HiAgent 不能直接访问个人电脑 `127.0.0.1` Harness；当前项目使用本机 Flowise 与受控 MCP，继续按本机边界验收。
2. HiAgent 不能原样承载 Flowise 内部数据库、会话和节点定义；当前项目不要求直接迁移 Flowise SQLite，后续按公开配置重建。
3. HiAgent 不是 Windows Node/Chromium/Playwright/DPAPI 运行时；当前项目的本地执行能力由自带 Harness/Worker 承担。
4. HiAgent 不是 Windows 单文件夹便携运行时；当前项目的便携交付由 Flowise/Harness 产品目录承担。

这些边界不改变当前项目状态、不新增本机验收门槛，也不代表上述 HiAgent 迁移事项已经完成。
