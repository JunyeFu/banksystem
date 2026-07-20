---
id: DOC-CONTROL-COLLABORATION-BRIEF-001
title: 衡准多轮协作简明控制卡
document_type: reference
domain: governance
status: accepted
authority: normative
version: 1.3
effective_date: 2026-07-20
owner: project-owner
---

# 衡准多轮协作简明控制卡

> 本文是每轮对话的首读入口，只回答“现在做什么、不能改什么、决定应写到哪里”。它不定义第二套阶段顺序、任务状态或代码细节。实施顺序只看 [`agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)，任务状态只看 [`agent/backlog.yaml`](../../agent/backlog.yaml)，完整约束与追踪只看 [技术控制登记册](technical-control-register.md)。

## 1. 当前一句话

I0—I7 的 Coze 演示是冻结的历史证据；当前唯一新增阶段是 I8：在 Windows 10/11 x64 上以免安装 Flowise 3.0.12 为个人/办公电脑主控，以 MCP 为唯一平台外工具通道，以 Harness SQLite 为回归事实源，通过 Midscene 受控作者化、确定性 Builder 和纯 Playwright 六次稳定性验证形成可由用户明确激活和调度的脚本，并保证所有 Flowise 能力均有 HiAgent 等价证据。

## 2. 每轮必须保持的控制项

| ID | 已冻结要求 |
|---|---|
| `HZ-C01` | 实习交付聚焦衡准自动化回归闭环，复兴银行只是被测系统和作品集。 |
| `HZ-C02` | 个人电脑 Flowise → 办公电脑 Flowise → 测试环境 HiAgent；三段证据不可互相冒充。 |
| `HZ-C03` | HiAgent 能力边界优先；Flowise 独有且无等价证据的能力不得进入正式同源流程。 |
| `HZ-C04` | Agent 平台只经认证 MCP 调本地能力，不直连 Shell、文件、SQLite、浏览器、凭据或任意 URL。 |
| `HZ-C05` | 产品为 Windows x64 解压即用目录，自带依赖，不依赖 WSL、Docker、管理员权限或全局安装。 |
| `HZ-C06` | Flowise `database.sqlite` 与 Harness `regression_platform.sqlite` 物理隔离；后者是回归领域唯一事实源。 |
| `HZ-C07` | 仓库 RAG 只用于开发；完整产品没有 `rag/`、自建 Embedding、Vector Store、Retriever 或 RAG 服务。 |
| `HZ-C08` | 用户只需输入自然语言案例；技术参数由 Workflow、MCP 和 Harness 生成。 |
| `HZ-C09` | Midscene 只产生视觉候选；Playwright 负责事实、断言、取证和正式回归。 |
| `HZ-C10` | Playwright 脚本只能由有限 DSL 的确定性 Builder 生成，禁止执行模型任意源码。 |
| `HZ-C11` | 稳定性门禁为桌面、窄屏各 3 次，共 6 次独立纯 Playwright 全部通过。 |
| `HZ-C12` | 脚本预览后由用户明确 `SAVE_ONLY / ACTIVATE / REJECT`；激活不自动运行或创建调度。 |
| `HZ-C13` | 周期和一次性调度绑定精确版本；正式调度只运行已验证 Playwright，不调用 LLM/Midscene。 |
| `HZ-C14` | 失败修复限于当前消息包和白名单补丁，最多 3 次；不得修改项目源码、弱化断言或自动激活。 |
| `HZ-C15` | 动作上下文叫 `CTX-L1...L3`；工具输出叫 `OUT-L0...L3`，绝对上限 128 KiB，二者不得混用。 |
| `HZ-C16` | 外部案例导入和视频案例是已确认的延期需求，不是取消项；衡准图形界面继续保持延期只读观测。 |
| `HZ-C17` | 视觉 LLM 完整窗口固定为 16,000 tokens，主控 LLM 固定为 1,000,000 tokens；容量上限不扩大数据访问权限。 |

## 3. 当前真实状态

- `HENGZHUN-I8-FLOWISE-001`：`IN_PROGRESS`；阶段1至阶段3代码与本机集成测试已完成，下一步为阶段4六次真实浏览器稳定性门禁。
- Flowise Windows 隔离探针：通过，但仅证明技术可行。
- 当前产品结构校验：保留 Coze 历史目录，同时要求 `flowise/`、`mcp/` 和 Flowise 平台知识制品；不再把 Coze Knowledge 写成 I8 当前权威。
- 历史 I4 Harness 已实现 SQLite 游标、单动作租约和“上一摘要/当前动作/下一预览”状态窗口，`npm.cmd run test:i4` 当前为 3/3 通过。
- I8 阶段1已让 Worker 以强类型 `ActionContextEnvelope` 为唯一视觉上下文，完成 `CTX-L1→L2→L3` 歧义升级、视觉16K/12K门禁、主控1M预算函数、图像/token预估、migration 009和不可变预算审计。
- 阶段2已落地一句自然语言输入的 Agentflow 制品、migration 010、三项 Harness 交接操作、14工具 Bearer MCP 白名单和 HiAgent 映射；阶段3新增 migration 011、严格执行计划、10操作有限DSL、确定性Builder、不可变候选来源链、Worker Hash/白名单校验，并启用第4项MCP工具 `candidate_get`。Flowise 3.0.12 `MCPToolkit` 已真实贯通 MCP→Harness→SQLite；当前为4项ACTIVE、10项失败关闭。真实 Agentflow 发布、MiMo 对话、真实Chromium六次稳定性和 HiAgent 运行仍未验收，不得由制品或集成测试代替。
- HiAgent MCP 注册、网络可达性、容量和真实 Workflow 映射：测试环境待验证。
- 开发 RAG 索引：`NOT_BUILT`，不影响产品。
- 外部案例/视频输入：`PROPOSED`，依赖 I8。

## 4. 多轮对话更新协议

每次提出新要求时，先输出一个“决策增量”，只含五项：

1. 新要求对应哪些 `HZ-Cxx`；
2. 是新增、修改、取消还是只做澄清；
3. 会影响哪些权威文件；
4. 是否改变实施顺序或任务状态；
5. 有无尚未验证的外部条件。

确认后按下表写入，禁止到处重复：

| 变化类型 | 唯一写入位置 |
|---|---|
| 项目阶段、先后、入口/退出门禁 | 唯一实施顺序 |
| 任务状态、依赖、允许路径、验收项 | `agent/backlog.yaml` |
| 平台、数据、工具、信任边界 | 当前架构基线和决策登记册 |
| Schema、状态机、DSL、MCP、测试细节 | I8 实施规格与 `contracts/` |
| 已实现/未实现事实 | 能力矩阵与证据 |
| 稳定跨任务仓库规则 | `AGENTS.md` |
| 控制项解释、追踪和变更影响 | 完整技术控制登记册 |

## 5. 停止条件

遇到以下任一情况，不得继续假设实现：

- 新决定与 `HZ-C01...HZ-C17` 冲突但用户尚未明确覆盖；
- Flowise 能力没有 HiAgent 等价证据；
- 需要 HiAgent 访问本地 MCP，但目标网络路径未真实证明；
- 要求把仓库 RAG、秘密、运行数据库或会话放入产品包；
- 运行证据、测试、契约和文档互相冲突；
- 新文档试图建立第二套实施顺序或任务状态。
