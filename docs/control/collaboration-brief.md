---
id: DOC-CONTROL-COLLABORATION-BRIEF-001
title: 衡准多轮协作简明控制卡
document_type: reference
domain: governance
status: accepted
authority: normative
version: 2.3
effective_date: 2026-07-22
owner: project-owner
---

# 衡准多轮协作简明控制卡

> 本文是每轮对话的首读入口，只回答“现在做什么、不能改什么、决定应写到哪里”。它不定义第二套阶段顺序、任务状态或代码细节。实施顺序只看 [`agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)，任务状态只看 [`agent/backlog.yaml`](../../agent/backlog.yaml)，完整约束与追踪只看 [技术控制登记册](technical-control-register.md)。

## 1. 当前一句话

I0—I7、I8和I9均为冻结历史。当前唯一实施阶段是I10：在不覆盖I9目录、六次证书和证据的前提下，补齐三类统一输入、DPAPI凭据引用、真实Midscene作者化、I10四次签证、完整源码、自然语言调度、反向修复与Windows正式便携交付；之后才进入HiAgent迁移。

2026-07-24最新输入识别边界：图片和视频附件统一使用发布包内PP-OCRv5 ONNX；视频以FFmpeg关键帧和确定性文字变化时间线形成待确认草案。主控只筛选OCR事实，MiMo仅用于后续Midscene浏览器作者化，不参与附件识别。

## 2. 每轮必须保持的控制项

| ID | 已冻结要求 |
|---|---|
| `HZ-C01` | 实习交付聚焦衡准自动化回归闭环，复兴银行只是被测系统和作品集。 |
| `HZ-C02` | 个人电脑 Flowise → 办公电脑 Flowise → 测试环境 HiAgent；三段证据不可互相冒充。 |
| `HZ-C03` | HiAgent 能力边界优先；Flowise 独有且无等价证据的能力不得进入正式同源流程。`Human Input`/`proceed/reject`只属于Flowise本机适配层，跨平台合同使用“消息+信息收集+选择器/条件+状态回流”。详见[能力边界基线](../architecture/overview/hiagent-flowise-capability-boundary-v1.md)。 |
| `HZ-C04` | Agent 平台只经认证 MCP 调本地能力，不直连 Shell、文件、SQLite、浏览器、凭据或任意 URL。 |
| `HZ-C05` | 产品为 Windows x64 解压即用目录，自带依赖，不依赖 WSL、Docker、管理员权限或全局安装；以自包含、路径无关、无秘密和生命周期合同验收，不建立第二台电脑专项门槛。 |
| `HZ-C06` | Flowise `database.sqlite` 与 Harness `regression_platform.sqlite` 物理隔离；后者是回归领域唯一事实源。 |
| `HZ-C07` | 仓库 RAG 只用于开发；完整产品没有 `rag/`、自建 Embedding、Vector Store、Retriever 或 RAG 服务。 |
| `HZ-C08` | 用户只需输入自然语言案例；技术参数由 Workflow、MCP 和 Harness 生成。需要补充或确认时，跨平台语义为信息收集与选择器/条件，不绑定 Flowise 专属按钮。 |
| `HZ-C09` | Midscene 只产生视觉候选；Playwright 负责事实、断言、取证和正式回归。 |
| `HZ-C10` | Playwright 脚本只能由有限 DSL 的确定性 Builder 生成，禁止执行模型任意源码。 |
| `HZ-C11` | I9历史证书保持桌面、窄屏各3次；I10新候选和修复候选固定各2次、共4次，任意失败不签证。 |
| `HZ-C12` | 脚本预览后由用户明确 `SAVE_ONLY / ACTIVATE / REJECT`；激活不自动运行或创建调度。 |
| `HZ-C13` | 周期和一次性调度绑定精确版本；正式调度只运行已验证 Playwright，不调用 LLM/Midscene。 |
| `HZ-C14` | 失败修复限于当前消息包和白名单补丁，最多 3 次；不得修改项目源码、弱化断言或自动激活。 |
| `HZ-C15` | 动作上下文叫 `CTX-L1...L3`；工具输出叫 `OUT-L0...L3`，绝对上限 128 KiB，二者不得混用。 |
| `HZ-C16` | I10正式实现XLSX/CSV/DOCX/JSON与MP4/H.264输入；衡准图形界面继续保持延期只读观测。 |
| `HZ-C17` | 主控最大1,000,000 tokens、输出8,192；视觉固定16,000/12,000/4,000。容量上限不扩大数据访问权限。 |
| `HZ-C18` | 发布配置只使用通用`CONTROL_* / VISION_*`变量。当前MiMo只使用Qwen3.5兼容报文；未来精确Qwen3.5端点必须通过实时容量门禁，低于产品最低档即阻止迁移，高于最低档不得被适配器静默限缩。两模型禁止原生绕过Flowise MCP节点调用工具。HiAgent视觉节点和本地回环可达性均未证明。 |
| `HZ-C19` | 明文凭据只进入本机安全表单并由DPAPI CurrentUser保护；Flowise、模型、普通SQLite表、脚本和证据只使用`credentialRef`。 |
| `HZ-C20` | HiAgent不能原生提供本机回环访问、Windows运行时、Flowise SQLite直接迁移或便携文件夹运行时；这些是已知边界，不阻断当前Flowise/Harness项目，仅作为后续迁移事项。 |

## 3. 当前真实状态

- `HENGZHUN-I8-FLOWISE-001`：`DONE`；七阶段确定性引擎、MCP、Worker和真实Chromium门禁已完成。
- `HENGZHUN-I9-FLOWISE-PRODUCT-001`：`DONE`；I9最终未压缩目录与本机证据已冻结。
- `HENGZHUN-I10-FLOWISE-FORMAL-001`：`DONE`；S0—S9及R0—R7已按本机交付边界完成。S9只刷新现有桌面目录的VERIFY清单和校验和，不重新导出或生成ZIP；213个核心文件、6个运行时资产和0项禁止内容通过，清单SHA-256为`282ca17c8775f675071b0287ef2793caa7dcb70f6ba098d3199c14c84281db07`。该结论不包含跨电脑便携认证。
- Flowise Windows 隔离探针：通过，但仅证明技术可行。
- 当前产品结构校验：保留 Coze 历史目录，同时要求 `flowise/`、`mcp/` 和 Flowise 平台知识制品；不再把 Coze Knowledge 写成 I9 当前权威。
- 历史 I4 Harness 已实现 SQLite 游标、单动作租约和“上一摘要/当前动作/下一预览”状态窗口，`npm.cmd run test:i4` 当前为 3/3 通过。
- I8 阶段1已让 Worker 以强类型 `ActionContextEnvelope` 为唯一视觉上下文，完成 `CTX-L1→L2→L3` 歧义升级；I8历史策略曾统一使用16K/12K/4K，I10现行控制已分层为主控1,000,000/8,192与视觉16K/12K/4K，保留图像/token预估、migration 009和不可变预算审计。
- I8 migration 009—015、MCP 7.0.0十四工具、Builder、Worker、六次签证、受控交付、精确调度、结果收件箱和限域修复均已验证。I9 P4完成MiMo与14/14工具连通，P5完成正式Agentflow发布与重启恢复，P6完成真实正向Flowise对话，P7完成受控定位器失效、最小失败上下文、白名单修复、6/6复验、独立激活、独立复跑和拒绝静默迁移调度的真实反向对话。便携候选、最终提交文件夹和HiAgent运行仍未验收。
- HiAgent MCP 注册、网络可达性、容量和真实 Workflow 映射：测试环境待验证。
- 开发 RAG 索引：`NOT_BUILT`，不影响产品。
- 外部案例/视频输入：已纳入I10，不再作为I9后延期项。

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
| Schema、状态机、DSL、MCP、测试细节 | I8/I9历史规格、I10实施规格与 `contracts/` |
| 已实现/未实现事实 | 能力矩阵与证据 |
| 稳定跨任务仓库规则 | `AGENTS.md` |
| 控制项解释、追踪和变更影响 | 完整技术控制登记册 |

## 5. 停止条件

遇到以下任一情况，不得继续假设实现：

- 新决定与 `HZ-C01...HZ-C19` 冲突但用户尚未明确覆盖；
- Flowise 能力没有 HiAgent 等价证据；
- 需要 HiAgent 访问本地 MCP，但目标网络路径未真实证明；
- 要求把仓库 RAG、秘密、运行数据库或会话放入产品包；
- 运行证据、测试、契约和文档互相冲突；
- 新文档试图建立第二套实施顺序或任务状态。
