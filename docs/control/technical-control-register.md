---
id: DOC-CONTROL-TECHNICAL-REGISTER-001
title: 衡准技术控制登记册与多轮变更协议
document_type: how-to
domain: governance
status: accepted
authority: normative
version: 1.9
effective_date: 2026-07-22
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
| 6 | I8/I9 历史规格、I10 当前规格、`contracts/` | 对象、Schema、状态机、DSL、MCP、测试 | 改写项目级先后 |
| 7 | 能力矩阵、证据 | 已证明/未证明状态 | 用历史证据证明新平台 |
| 8 | 调研、历史、正式文书 | 背景和外部依据 | 覆盖以上权威 |

关键入口：

- [简明控制卡](collaboration-brief.md)
- [唯一实施顺序](../../agent/plans/active/v54-implementation-batches.md)
- [任务状态源](../../agent/backlog.yaml)
- [Flowise/SQLite/HiAgent 架构基线](../architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md)
- [HiAgent/Flowise 能力边界基线](../architecture/overview/hiagent-flowise-capability-boundary-v1.md)
- [I8 实施规格](../design/regression-platform/i8-deterministic-authoring-spec-v1.md)
- [I9 Flowise 产品化规格](../design/regression-platform/i9-flowise-productization-spec-v1.md)
- [当前能力矩阵](../current-state/capability-matrix.md)

## 2. 本轮控制文档审计结论

### 2.1 已正确保留

- Flowise 替换 Coze 作为个人/办公电脑入口，HiAgent 作为测试环境目标。
- HiAgent 已证明能力交集优先，Flowise 本机成功不能冒充 HiAgent 成功。
- `Human Input`、`Proceed`、`Reject` 不是已证明的 HiAgent 原生能力；它们只允许作为 Flowise 本机适配器，跨平台合同统一使用消息、信息收集、选择器/条件和状态回流。
- Agent 与本地工具职责分离，平台外调用只走 MCP。
- Flowise 平台知识、Flowise SQLite、Harness SQLite 的权威边界和禁止双写。
- 仓库 RAG 只用于开发，产品不建设 RAG 子系统。
- HiAgent 本机访问、Windows 运行时、Flowise SQLite 直接迁移和便携文件夹运行时属于已知非阻断边界，当前 Flowise 项目不因这些边界停止。
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
| `AUD-011` | 历史代码缺少 CTX 升级、token/图像估算、预算错误码和 migration 009 | `CLOSED_STAGE1_CODE_UPDATED`：已实现 L1→L2→L3、视觉与主控统一16K/12K预算、图像预估、确定性错误码和不可变审计 |
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
| `AUD-024` | 合成同步页面会掩盖真实门户异步加载竞态 | `CLOSED_STAGE4`：`expectVisible`改为冻结30秒上限内等待可见并携带非敏感目标错误码；真实复兴银行门户完成6/6 |
| `AUD-025` | 稳定性样本可能复用认证、Fixture或以重试替换失败 | `CLOSED_STAGE4`：migration 012固定2视口×3序列、独立Fixture；每次新建空storage state BrowserContext；任一失败整批失败且无重试任务 |
| `AUD-026` | 候选、运行时或证据在签证前后可能漂移 | `CLOSED_STAGE4`：Worker复核候选/manifest Hash，绑定运行时指纹、断言集Hash、证据形状Hash并回验文件Hash/长度；证书及终态受不可变触发器保护 |
| `AUD-027` | 阶段4能力可能仅存在于专项脚本而未进入常驻运行链 | `CLOSED_STAGE4`：常驻Worker轮询稳定性Claim、真实执行并回传Completion；环境级启动失败保持租约超时失败关闭，不伪造证书 |
| `AUD-028` | 未持证或签证后被篡改的候选可能被提前展示或交付 | `CLOSED_STAGE5`：预览和下载前重新复核证书状态、候选/manifest/脚本身份及Hash；未持证或不一致均失败关闭 |
| `AUD-029` | 大脚本预览可能越过输出预算、截断行或泄露本机路径/凭据 | `CLOSED_STAGE5`：按完整行分页并限制16KiB工具输出；响应不含绝对路径、凭据、Cookie或storage state |
| `AUD-030` | 下载链接可能长期复用或绕过审计 | `CLOSED_STAGE5`：只发5分钟一次性随机授权，SQLite仅保存Token Hash；使用、过期及候选下载均审计，终态不可变 |
| `AUD-031` | 保存、激活和拒绝语义可能混淆，或激活隐式触发运行/调度 | `CLOSED_STAGE5`：不可变决策只接受`SAVE_ONLY/ACTIVATE/REJECT`；精确版本并发门禁，ACTIVATE不创建Run或Schedule |
| `AUD-032` | 正式回归可能运行未激活版本、任意路径或再次调用模型 | `CLOSED_STAGE5`：`run_submit`只接受已激活持证候选，任务携带受控相对目录和双Hash；常驻Worker以纯Playwright固定Chromium执行并阻断外部来源 |
| `AUD-033` | 阶段5工具启用可能连带提前开放调度/修复或冒充Flowise/HiAgent验收 | `CLOSED_STAGE5_EVIDENCE_BOUNDARY`：MCP只启用8项，阶段6—7六项稳定失败关闭；Flowise续办制品已冻结但运行发布、MiMo和HiAgent仍单独未验证 |
| `AUD-034` | 旧调度只绑定plan并在执行时追随scripts.current_version | `CLOSED_STAGE6`：migration 014回填scriptId/version/Hash，执行按精确script_versions复核；不能回填的历史调度自动禁用 |
| `AUD-035` | 一次性自然语言时间可能被伪装成Cron或在重启后重复运行 | `CLOSED_STAGE6`：ONE_TIME只接受带偏移runAt；唯一execution和RUNNING状态阻止重复，成功/最终失败自动停用 |
| `AUD-036` | 用户可能被迫提供Cron、凭据或技术版本，或未确认即创建调度 | `CLOSED_STAGE6`：Flowise结构化LLM规范化并回显，Flowise Human Input适配器确认后调用一次；跨平台迁移必须改用HiAgent信息收集+选择器/条件，不得迁移Human Input节点名 |
| `AUD-037` | Agent离线或会话中断可能丢失正式运行结果 | `CLOSED_STAGE6`：所有正式Run终态按namespace+runId幂等写入不可删除SQLite收件箱，支持分页、未读筛选和确认已读 |
| `AUD-038` | 调度/收件箱开放可能连带开放阶段7修复或泄露Artifact路径 | `CLOSED_STAGE6_EVIDENCE_BOUNDARY`：MCP仅11项ACTIVE、阶段7三项失败关闭；收件箱只返回脱敏摘要与Artifact元数据，不返回relativePath |
| `AUD-039` | 历史七类事故不足以覆盖I8正反向链路 | `CLOSED_STAGE7_CLASSIFICATION`：migration 015和确定性分类器冻结十一类事故，分类不由LLM自由填写 |
| `AUD-040` | 失败诊断可能把整库、整日志或凭据送入模型 | `CLOSED_STAGE7_CONTEXT_BOUNDARY`：只生成脱敏`StepFailureEnvelope`，默认CTX-L1；仅在修复验证失败后按相邻证据升级L2/L3，响应不含绝对路径、凭据或SQLite内容 |
| `AUD-041` | 主控LLM可能借修复提交完整源码或扩大工具能力 | `CLOSED_STAGE7_PATCH_ALLOWLIST`：严格Schema只允许目标映射、固定等待、受控参数、步骤顺序和不弱化断言；未知字段、源码、任意选择器和第四候选均拒绝 |
| `AUD-042` | 修复候选可能绕过稳定性门禁或自动替换正式脚本 | `CLOSED_STAGE7_CERTIFICATE_AND_HUMAN_GATE`：每候选独立ID/版本/来源链/Hash，必须重新2视口×3次并取得新证书；仅显式ACTIVATE生效，不自动运行或迁移既有调度 |
| `AUD-043` | 修复激活后阶段5/6仍可能误选旧脚本版本 | `CLOSED_STAGE7_VERSION_HANDOFF`：`run_submit`和新建Schedule优先选择已激活修复版本并复核计划/脚本Hash；既有Schedule保持冻结版本，迁移必须由用户另行创建或明确操作 |
| `AUD-044` | 本机Stage7自动测试可能被误报为Flowise/MiMo/HiAgent完成 | `CLOSED_FLOWISE_OPEN_HIAGENT`：真实Flowise正反向对话、MiMo主控和本机目录验收已完成；任何本机证据仍不得写成HiAgent目标环境已安装、联网或验收 |
| `AUD-045` | 隔离探针或未跟踪目录可能被正式产品运行依赖 | `CLOSED_I9_P1_RUNTIME_BASELINE`：正式Flowise 3.0.12运行树已收编到`flowise/app/`，Bundled Node 20.20.2、Chromium 1217、依赖锁与完整目录Hash已冻结并离线复算；配置和正式入口不依赖`probes/`、全局Node、WSL、Docker或运行时下载 |
| `AUD-046` | 缺少四服务统一启停、状态和正式 URL | `CLOSED_I9_P2_LIFECYCLE`：产品自有命令已按固定顺序管理四服务，PID归属、独立健康、端口冲突、弱Token、幂等启动、部分失败清理、反序安全停止及双SQLite重启恢复均有真实证据；未知占用不终止 |
| `AUD-047` | Flowise 平台 SQLite、平台知识与 Harness 事实可能越权或双写 | `CLOSED_I9_P3_PUBLIC_IMPORT_AND_DUAL_SQLITE`：平台知识与参数引用只经Flowise公开账户/导入/查询API装配；Harness migration 016只保存不可变快照引用。两库独立备份、停机恢复、Hash、`quick_check`、职责表与正文禁入均在隔离真实运行中通过 |
| `AUD-048` | Agentflow/MCP 制品存在可能被误报为 MiMo 与十四工具已经真实连通 | `CLOSED_I9_P4_MIMO_AND_MCP`：Bundled Flowise MCP客户端已真实调用14/14工具并验证鉴权、幂等、预算、超时、安全错误、Human Input和循环；MiMo v2.5已经Flowise同源`@langchain/openai`适配器和JSON响应格式完成真实严格结构化调用，凭据未写入制品或输出 |
| `AUD-049` | 可加载 Agentflow JSON 不等于已经发布且重启可恢复 | `CLOSED_I9_P5_PUBLICATION_AND_RESTART`：固定ID正式Agentflow已通过公开凭据、导入、更新、校验和导出API私有发布，校验0问题；停止四服务并从同一双SQLite重启后Flow ID、发布状态、定义Hash和导出Hash一致，无直接数据库写入或临时手工状态 |
| `AUD-050` | 本机引擎测试可能被误报为用户自然语言正反向闭环 | `CLOSED_I9_P6_P7`：P6普通中文输入到脚本生成、6/6、预览、激活、按需纯Playwright运行及同会话回复已真实通过；P7受控定位器失效经`CTX-L1`、白名单提案、新6/6证书、独立激活和独立复跑完成37节点真实Flowise反向对话，修复版调度被明确拒绝且旧调度未迁移 |
| `AUD-051` | 单机复制或探针恢复可能被误报为已通过便携验收 | `CLOSED_LOCAL_I9_OPEN_OFFICE_RESTORE`：最终目录在当前电脑全新运行态完成准备、四服务、内置Chromium核心E2E、双SQLite恢复和重启5/5；第二台电脑证据明确移交办公电脑阶段，不由本机结果推断 |
| `AUD-052` | 已验证候选仍可能夹带运行态、秘密或依赖人工整理 | `CLOSED_I9_P9_FOLDER_EXPORT`：冻结提交`3884b6d`生成唯一最终未压缩目录，白名单、SBOM、6资产树、99核心文件、秘密/运行态/绝对路径扫描和独立Hash复算通过，未生成ZIP |
| `AUD-053` | Flowise、Coze、HiAgent 分支可能在迁移时互相覆盖 | `OPEN_I9_RELEASE`：I9 P9 通过后才把 Flowise 版冻结到 `main`；保留 `coze`，再从该基线新建 `hiagent`，禁止自动 merge、删分支或 force push |
| `AUD-054` | MiMo 的报文扩展或原生工具能力可能生成无法迁移到 Qwen3.5/HiAgent 的实现 | `CLOSED_PROTOCOL_OPEN_LIVE_CAPABILITY_GATE`：视觉固定Qwen3.5兼容非思考、非流式、图片+JSON报文和16K/12K/4K治理预算；I10主控独立为1M/8192。未来精确Qwen3.5 checkpoint、推理后端和HiAgent连接器必须通过实时能力门禁，低于最低档阻止迁移，高于最低档记录且适配器不得静默限缩 |
| `AUD-055` | 成果汇报旧表述会让明文凭据进入Flowise、模型、脚本和证据 | `CLOSED_I10_G03`：本机表单、DPAPI CurrentUser和`credentialRef`真实链路通过；源码与2129个运行输出文件扫描同时核对5项受保护运行值，命中0项 |
| `AUD-056` | I9的固定六次证书会错误认证I10新候选，或历史证书被改写 | `CLOSED_I10_G06`：不可变策略绑定区分`I8_2X3_V1/6`和`I10_2X2_V1/4`；候选与修复候选均按四次门禁，I9六次历史兼容回归通过 |
| `AUD-057` | 厂商环境变量和机器专属配置破坏便携性 | `CLOSED_I10_G10_G11_RUNTIME`：正式接口统一`CONTROL_* / VISION_*`，2026-07-22真实DeepSeek/MiMo探针均`mock=false/degraded=false`；厂商变量只允许进程内适配 |
| `AUD-058` | 视频导入与Midscene作者化的证据边界可能混淆 | `CLOSED_I10_G02_G04_G05_S8`：视频导入仅使用PP-OCRv5、确定性文字变化时间线和主控事实筛选，全部事实人工确认；Midscene真实视觉只发生在后续作者化，候选公开结构化`REAL/MIDSCENE/PLAYWRIGHT_VERIFIED`与ActionTrace/Playwright双Hash，任一链失败均不得由另一链冒充 |
| `AUD-059` | 当前路径可运行被泛化成平台可便携 | `CLOSED_LOCAL_VERIFY_ONLY`：按2026-07-24用户决策取消重新导出和ZIP门槛，只关闭当前桌面目录的VERIFY清单与校验和；213个核心文件、6个资产树、0项禁止内容和执行前后文件集合一致，清单SHA-256为`282ca17c8775f675071b0287ef2793caa7dcb70f6ba098d3199c14c84281db07`。不得据此宣称跨电脑便携 |
| `AUD-060` | 图片中的输入值只被OCR展示但未进入可执行案例，或主控模型猜测缺失值 | `CLOSED_I10_G13_G16_RUNTIME`：三入口统一`supportingImages[]`，脱敏OCR经事实候选和来源Hash进入`ActionStepV2`；2026-07-23真实主控图片探针筛出6条事实，未知值仍强制人工确认 |
| `AUD-061` | 原始图片、密码、验证码、PIN或私钥进入模型、SQLite、日志、脚本和证据 | `CLOSED_I10_G14_SECURITY`：原始图片仅在本机受控附件/临时目录处理，主控只接收脱敏OCR、Hash和来源；运行证据`mock=false/degraded=false`，验证秘密不持久化 |
| `AUD-062` | Midscene或定时任务把人工验证阻塞冒充回归成功 | `CLOSED_I10_G17_G20_RUNTIME`：验证挑战、版本化人工决定、不可变事件、同会话`RESUMED`和`HUMAN_IN_LOOP_REQUIRED`失败关闭已落地并真实探针通过；U盾只协调浏览器，证据明确`hardwareOperationVerified=false` |

`AUD-009...AUD-043`已关闭I8；`AUD-044...AUD-052`已关闭本机I9；`AUD-053`继续约束分支发布。I10的`AUD-055...AUD-059`已按本机边界关闭，其中`AUD-059`仅证明现有桌面目录VERIFY一致性；精确内网Qwen3.5能力仍按`AUD-054`实时门禁判定。

I10功能缺陷关闭的机器可读权威为`platform/hengzhun-regression-system/flowise/i10/gap-closure-matrix-v1.json`，只读验证入口为`npm run verify:i10:closure`。验证器必须逐项核对`I10-G01...I10-G20`的实现和测试文件；G01—G12继续绑定原S8真实证据，G13—G20必须另有图片/验证链实时证据后才可从本机合同通过提升为真实运行关闭。S9另以桌面目录`manifest/files.sha256.json`和`VERIFY.cmd --no-pause`结果为权威；它只证明当前目录一致性，也不把没有设备的U盾硬件操作冒充已验证。

### 2.4 仍未验证但不得遗忘

| 风险 ID | 未验证项 | 对当前工作的影响 |
|---|---|---|
| `EXT-001` | HiAgent 目标服务器能否注册并访问衡准 MCP | 不阻塞本机 I9；阻塞后续 HiAgent 迁移验收 |
| `EXT-002` | Flowise 每个已用节点、变量、Flowise Human Input适配器、Knowledge、MCP 语义在真实HiAgent租户中的逐项等价 | 本机只完成映射证据；Human Input/Proceed/Reject必须转换为信息收集+消息+选择器/条件；阻塞后续HiAgent迁移验收，不重开I9 |
| `EXT-003` | 其他 Windows 电脑上的实际部署表现 | 属于未来普通部署验证，不是I10实现项或完成门槛；发现问题时按平台缺陷回流，不预建机器专项流程 |
| `EXT-004` | MiMo v2.5 长时间 Midscene 作者化稳定性 | I9已完成受控案例验收；该项只约束后续扩大案例集与长期稳定性加固，不重开I9 |

## 3. 冻结需求登记

### `HZ-C01` 产品与交付目标

- 衡准自动化回归闭环是实习交付主体。
- 复兴银行是本机被测系统和作品集，不在 I9 扩展全部银行业务。
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

Agent 平台只负责自然语言接收、平台知识查询、案例结构化、最小澄清、验收摘要、`IntentPlan`、注册 MCP 编排、信息收集/确认语义、结果解释和调度自然语言规范化。Flowise 的 `Human Input`、`Proceed`、`Reject` 仅是本机交互适配器，不是跨平台业务合同。

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

### `HZ-C16` I10统一输入

- I10首版实现XLSX、CSV、DOCX、JSON和MP4/H.264；其他测试框架源码适配仍延期。
- 原始附件由Flowise管理并以受控ID交给Harness；视频只在本机抽帧、PP-OCRv5识别、脱敏和文字变化比对，主控只收到OCR时间线，视觉模型不接收视频关键帧。
- 视频脱敏必须使用OCR坐标遮挡凭据标签及相邻值、手机号、邮箱和API Key样式内容；原始帧在成功或失败后删除。Harness只接受受控目录内Hash一致、标记真实MiMo调用且满足16K/12K/4K预算的关键帧证据。
- 三类输入统一形成CaseDraft，低置信度或缺字段必须人工修正；候选仍走Harness/Midscene/Builder/I10四次Playwright/人工激活链。`I10_2X2_V1`固定为两个视口各2次，候选与修复候选使用同一策略；领取和回传必须绑定策略、运行数、视口、序号、Fixture与脚本Hash，任一失败不得签证或激活。完整源码仅通过5分钟一次性下载授权交付，内容、执行、证书和响应Header的SHA-256必须相同。
- 调度只接受`ON_DEMAND / ONE_TIME / RECURRING`；单次要求未来且带偏移的ISO时间，周期要求五段Cron与IANA时区。春季不存在时刻顺延到下一有效日期，秋季重复本地分钟仅执行一次。misfire、重试、停用、重启恢复和结果收件箱由Harness SQLite负责；Flowise只解析已确认语义并通过MCP提交或查询。
- 案例文件必须返回字段映射预览和逐记录批量错误；有效记录按原ordinal保留，坏记录只保存错误码与Hash。任何未解决错误都阻止确认，修正后写不可变resolution再复核，禁止静默跳过坏记录。
- 衡准图形界面保持延期且只读观测，不成为 Agent、知识或控制后台。

### `HZ-C17` 主控与视觉 LLM 上下文窗口

I10的产品请求预算如下。它们是最低兼容档和安全治理预算，不是对未来模型厂商宣称的物理容量做静默裁剪：

| 消费者 | 总窗口硬上限 | 输入预算 | 输出保留 | 允许上下文 |
|---|---:|---:|---:|---|
| Midscene 视觉 LLM | 16,000 | 最多 12,000 | 至少 4,000 | 默认 `CTX-L1`，规则证明需要时 `CTX-L2`，极少数分支可用裁剪后的 `CTX-L3` |
| Flowise/HiAgent 主控 LLM | 1,000,000 | 按Workflow最小依赖锥动态控制 | 最多8,192 | 当前案例、已发布知识命中、Workflow状态、MCP脱敏摘要和当前最小依赖锥 |

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

1. 1M是当前I10主控请求档上限，不是读取仓库、SQLite、其他案例、完整日志或完整历史对话的授权。
2. 默认仍使用当前 Workflow 节点所需最小上下文；只有确定性规则证明信息不足时才扩展依赖锥。
3. 单次输出不得超过8,192 tokens，总上下文不得超过1,000,000；超限返回`CONTROLLER_CONTEXT_BUDGET_EXCEEDED`并通过摘要、分页或重新拆分Workflow降级。
4. 主控与视觉是两个独立授权包；任何主控大窗口内容都不得直接转发给16K视觉模型。

### `HZ-C18` Qwen3.5 协议兼容与内网能力门禁

1. MiMo v2.5只是当前视觉提供方；当前制品仅证明Qwen3.5兼容协议，不证明任意Qwen3.5部署的实际容量。
2. 视觉请求只使用Qwen3.5已确认的OpenAI兼容消息、图片和JSON边界；响应只读取受Schema验证的`message.content`。
3. 结构化输出固定 `response_format={"type":"json_object"}`，提示中必须出现 JSON，关闭 thinking 和 streaming；所有输出仍须本地 Schema 校验，最多三次总尝试，失败关闭。
4. 视觉单次最大输出4,000 tokens、总量16,000、输入12,000；主控执行1M/8,192独立规则。
5. 两模型均禁用原生工具绕过、并行工具和提供方私有执行能力。MCP由Flowise/HiAgent Workflow节点顺序调用。
6. 正式配置只暴露`CONTROL_* / VISION_*`；厂商兼容别名只能在进程内生成，不得进入对话或发布接口。
7. 进入内网时必须记录精确模型ID/checkpoint、推理后端版本、HiAgent连接器版本和提供方容量元数据，并完成主控JSON、视觉截图JSON、usage和MCP边界真实探针。
8. 主控低于1M/8192或视觉低于16K/12K/4K时必须阻止迁移，不得静默降低项目能力；高于最低档时必须保留并记录端点声明能力，适配器不得人为截断。实际Workflow仍按最小依赖锥和产品安全预算发请求，容量不等于数据访问授权。
9. 权威机器可读门禁为`flowise/i10/intranet-qwen35-capability-gate-v1.json`；其当前状态为`LIVE_ENDPOINT_UNVERIFIED`，只有目标内网端点实测后才能改为通过。

### `HZ-C19` 本机加密凭据引用

明文账号密码只允许提交到回环地址上的短时本机表单。Harness用Windows DPAPI CurrentUser加密至`.data/credentials`，SQLite只保存`credentialRef`、相对路径、密文Hash和保护范围。Worker执行时经Bearer保护的回环内部接口临时解密，使用后清空引用。Flowise、主控/视觉上下文、CaseDraft、ActionTrace、Playwright源码、日志、截图、证据、Git和发布包均不得出现明文；迁移至办公电脑后必须重录。

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
5. 如改变代码契约，更新对应 I10 规格和 `contracts/`，I8/I9 历史规格不得改写；
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
| 主控 LLM | `HZ-C03/C08/C09/C14/C17/C18/C19` | 1,000,000总上下文/8,192最大输出、通用`CONTROL_*`变量、最小依赖锥、无全库/全项目读取、上下文超限降级 |
| Builder/DSL | `HZ-C10/C12` | 白名单、确定性 Hash、任意代码拒绝 |
| Playwright/证书 | `HZ-C12` | 2 视口 × 3 次、独立 Fixture/Context、证据一致 |
| 调度/收件箱 | `HZ-C13` | 精确版本、Cron/runAt、misfire、重启、离线恢复 |
| 便携包 | `HZ-C05` | 自包含依赖、路径无关、含空格/中文目录、无全局依赖、无秘密、生命周期可重复 |
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
