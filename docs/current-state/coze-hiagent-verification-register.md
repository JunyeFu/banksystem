---
id: DOC-STATE-COZE-HIAGENT-VERIFICATION
title: Coze 模拟 HiAgent 平台能力待验证登记册
document_type: register
domain: current-state
status: verified
authority: evidence
version: 1.2
effective_date: 2026-07-16
owner: project-owner
---

# Coze 模拟 HiAgent 平台能力待验证登记册

> 本登记册固化平台能力的证据状态和验证门禁。它不把用户提供的调研文本、模型回答、营销描述或推测写成平台事实；实施顺序仍以 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md) 为唯一权威，任务状态仍以 [`../../agent/backlog.yaml`](../../agent/backlog.yaml) 为唯一来源。

## 1. 状态定义

| 状态 | 含义 | 能否进入实现前提 |
|---|---|---|
| `REFERENCE_VERIFIED` | 已在 HiAgent 2.5.1 本地帮助文档或现场界面中找到明确依据 | 只能证明 HiAgent 边界；Coze 端仍需一致性验证 |
| `RUNTIME_VERIFIED` | 已在本机真实运行并保存可复验结果 | 可在已测范围内使用，不得外推到未测场景 |
| `PARTIALLY_VERIFIED` | 部分路径通过，但覆盖或稳定性仍不足 | 仅允许进入受控试验，不得宣称完整可用 |
| `FAIL` | 已按规定执行，但目标主张在当前平台/版本不成立 | 依赖该主张的实现必须改用兼容路径或收缩范围 |
| `BLOCKED` | 已准备测试条件，但外部平台入口或前置能力使真实运行无法继续 | 不得推断结果；无依赖的本机实现可继续 |
| `PENDING` | 只有用户提供材料、调研结论、模型回答或设计假设 | 依赖该能力的批次不得完成验收 |
| `EXCLUDED` | 超出 HiAgent 2.5.1 已证明边界、违反安全规则或不属于当前版本 | 当前实现禁止依赖，不作为待验证能力偷渡 |

状态变更必须同时记录验证日期、平台版本、验证人、证据引用和失败影响。截图只能辅助证明界面状态；工具真实调用、输入输出和副作用必须由脱敏运行记录证明。

## 2. 已有依据，不再作为纯待验证事实

| 能力 | 状态 | 当前依据 | 保留边界 |
|---|---|---|---|
| HiAgent 本地上传 Skill | `REFERENCE_VERIFIED` | HiAgent 2.5.1 [`Skills.md`](../../knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/Skills.md) 明确支持 `.zip`、`.skill`，单包不超过 10 MiB，并解析、校验 `SKILL.md` | 不能据此证明 Coze 接受相同制品或具有相同执行语义 |
| HiAgent OpenAPI 导入 | `REFERENCE_VERIFIED` | HiAgent 2.5.1 [`插件.md`](../../knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/插件.md) 明确支持 JSON/YAML OpenAPI 文件，单文件不超过 2 MiB | 不能据此证明 Coze 对所有 Schema 关键字均无损导入 |
| HiAgent 插件鉴权 | `REFERENCE_VERIFIED` | 同一份 [`插件.md`](../../knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/插件.md) 列出 Basic Auth、Bearer Token、API Key 和 OAuth2 | 本项目仍固定采用 Bearer Token，不因平台支持更多方式而扩权 |
| HiAgent 插件超时 | `REFERENCE_VERIFIED` | 同一份 [`插件.md`](../../knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/插件.md) 明确为 1～30 分钟，默认 1 分钟 | 这是 HiAgent 2.5.1 边界，不是 Coze 实测值；项目长任务仍采用异步协议 |
| HiAgent Object 参数嵌套 | `REFERENCE_VERIFIED` | 同一份 [`插件.md`](../../knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/用户指南/插件.md) 明确只支持两级嵌套 | Harness OpenAPI 首版不得设计超过两级的必需输入结构 |
| HiAgent 插件输出平台上限 | `REFERENCE_VERIFIED` | HiAgent 2.5.1 [`插件异常说明`](../../knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/常见问题/异常问题/插件.md) 记录 `2097152` 字节，即 2 MiB | Harness 仍执行 L0～L3 分级预算和 128 KiB 应用硬上限 |
| MiMo v2.5 与 Midscene 原子输入 | `PARTIALLY_VERIFIED` | 1024×768 下原子 `aiInput` 连续 3/3 通过；开放式 `aiAct` 曾出现错误落点、错误自报成功和重规划耗尽 | 只证明登录页原子输入；完整作者化稳定性仍由 `PLAT-V014` 门禁 |

## 3. 待验证项

| ID | 优先级/批次 | 待验证主张 | 验证动作 | 通过证据与判定 | 失败影响 |
|---|---|---|---|---|---|
| `PLAT-V001` | P0 / I1 | Coze 公开界面能上传与 HiAgent 相同结构的 `.skill`/`.zip`，并正确读取 `SKILL.md`、`references/`、`scripts/` | 上传不含网络、文件写入和业务权限的最小合规 Skill；分别让 Agent 引用主指令、参考文件和只读脚本结果 | 平台版本、包 Hash、上传/解析/发布界面、三类内容实际调用记录齐全；失败或被忽略的目录必须明确 | 不得宣称同一 Skill 制品可直接迁移；改为同源生成平台专属制品或缩减能力 |
| `PLAT-V002` | P0 / I1 | Coze Skill 不会自动获得 `workspace_list`、`workspace_read` 等 Node MCP 本地工具；同语义必须通过已注册 Harness Plugin 实现 | 在无 MCP 注册的隔离 Agent 中调用带 MCP 指令的测试 Skill；再通过受控测试 Plugin 完成等价只读动作 | 直接 MCP 调用不可用且不会绕过工具注册；Plugin 路径有完整审计 | 若 Coze 隐式提供额外本地权限，当前模拟方案安全边界失败，必须禁用该能力 |
| `PLAT-V003` | P0 / I1-I2 | Coze OpenAPI 导入支持首版所需的 query、path、header、JSON requestBody 以及 string、integer、number、boolean、array、object 和两级嵌套 | 导入无业务副作用的 conformance OpenAPI，每种位置和类型至少调用一个回显端点 | 导入后 Schema、必填、枚举、默认值、数组和两级对象未丢失；请求与回显逐字段一致 | 收缩 Harness 契约到实际交集；不得用自然语言猜测丢失参数 |
| `PLAT-V004` | P0 / I2-I3 | 七个 Harness 工具可由一个 OpenAPI 文件无损导入、发布和真实调用 | 对 `case_create_draft`、`case_get`、`plan_compile`、`run_submit`、`task_get`、`decision_submit`、`artifact_get_metadata` 逐一执行合成数据契约测试 | 工具名、方法、路径、输入/输出 Schema、错误响应和同一服务地址全部正确；Harness 请求日志证明结果来自真实端点而非平台示例或 Mock | 未通过的工具不得进入 I3；修订契约后重新导入并全量复验 |
| `PLAT-V005` | P0 / I2 | Coze 能按公开配置向 Harness 注入 Bearer Token，且不会在对话、日志和错误中泄露 | 使用一次有效令牌、缺失令牌、错误令牌和已轮换令牌调用只读端点 | 有效调用成功；三类负测稳定拒绝；所有证据只含指纹或脱敏值 | 鉴权链未通过则禁止 Coze 连接真实 Harness |
| `PLAT-V006` | P1 / I1-I3 | Coze 当前版本中插件节点、HTTP 节点、工作流和对话的实际超时、异常处理与重试行为符合可用配置 | 在 1、30、60、120 秒等安全延迟档运行合成异步任务，记录平台配置和实际中断点；不执行银行操作 | 得到当前版本的可重复测量表；Harness 在最短实测窗口内返回 `taskId`，不依赖长同步调用 | 缩短同步受理窗口并调整轮询；不阻塞 Harness 异步内核开发 |
| `PLAT-V007` | P2 / I6 | Coze 当前租户/版本的 QPS、QPM、并发和退避限制足够支撑演示 | 优先读取租户控制台或官方配置；只做低强度、可停止的合成并发验证，不对云平台压测 | 保存配额界面/官方依据和低于配额的成功运行；形成 Harness 限流参数 | 降低并发、增加队列和退避；只阻塞调度与容量验收 |
| `PLAT-V008` | P1 / I2-I3 | Coze 节点、工作流、变量和知识分段的数据大小限制与 Harness 128 KiB 输出预算兼容 | 对 L0～L3 边界值执行 UTF-8 多字节、分页和 Artifact 降级测试；平台最大值优先以官方依据确认 | 128 KiB 以内的 L3 合规响应可用；越界在 Harness 内被拦截，不依赖 Coze 截断 | 下调对应等级上限；禁止把平台可能截断当作正常分页 |
| `PLAT-V009` | P0 / I1 | 自托管 Coze 容器能通过受控本机网络访问 Harness，且无需公网、内网穿透或暴露银行内部端口 | 使用 Docker DNS/受控主机名访问 Harness 健康与回显端点，执行 allowlist 正负测试 | Coze 到 Harness 成功；其他容器或非允许路径失败；网络图与端口证据脱敏 | 重设本机网络方案；I1 不得以公网穿透替代 |
| `PLAT-V010` | P2 / I6 | 未来云端 HiAgent 对 Harness 地址的域名/IP、TLS、私网连接和可达性要求 | 在实际目标 HiAgent 版本和部署网络中检查公开配置并调用合成端点 | 得到目标版本的地址格式、证书、DNS、路由和鉴权证据；不以 Coze 云规则代替 | 调整迁移拓扑；不反向阻塞本机 I1～I4 |
| `PLAT-V011` | P0 / I3 | Coze 会话/Workflow 能只保存轻量引用，并在会话中断后用 `taskId`/`runId` 恢复 Harness 任务 | 提交长任务后主动中断会话，重新进入或新建会话恢复查询 | SQLite 任务不中断、不重复创建；新会话读取同一对象版本并返回一致结果 | 改为用户显式携带恢复码；不得把领域状态迁入 Coze 变量 |
| `PLAT-V012` | P1 / I1-I3 | Coze Knowledge Base 能满足首版资料导入、检索、版本标识和可审计引用需求 | 使用小型合成知识集执行命中、无命中、版本替换、权限隔离和检索快照测试 | 每次回答可关联资料集/版本/检索结果标识或稳定 Hash；无命中不编造 | 降低运行时 RAG 自动化程度，要求 Agent 明示证据不足；不得回退仓库 `docs/`/`rag/` |
| `PLAT-V013` | P1 / I1 | Coze 的 Agent、Workflow、变量和知识检索只使用 HiAgent 2.5.1 已证明能力的交集 | 建立逐项 conformance 清单，实际创建最小 Agent/Workflow，检查节点、变量、发布与权限 | 每个在用能力都有 HiAgent 2.5.1 依据和 Coze 运行证据；无依据能力为 0 | 删除 Coze 独有节点或改为 Harness 协议，不得扩大 HiAgent 边界 |
| `PLAT-V014` | P1 / I4 | MiMo v2.5 在 Midscene 原子作者化中的稳定性足够支撑 LOW/MEDIUM 场景 | 在至少 5 个视口对 `aiLocate`、`aiInput`、`aiTap`、`aiScroll` 分别重复运行，并由 Playwright 独立验证 DOM、URL、请求和业务状态 | 所有纳入正式路由的动作均无错误自报成功、无越权副作用；失败能停止并进入重试或 `WAITING_USER` | 移除失败动作的 Midscene 执行权，退化为 Midscene 定位 + Playwright 操作或纯 Playwright |

## 4. 明确排除而非继续等待验证

| ID | 被排除主张 | 原因 | 当前处理 |
|---|---|---|---|
| `PLAT-X001` | 通过 Coze 私有 `skill_draft_create`、数据库写入或容器挂载自动安装 Skill/Plugin | 现场已确认的 HiAgent 使用方式是公开界面上传/导入；私有管理能力会破坏可迁移性与权限边界 | I1～I6 禁止依赖；只能通过公开界面或已证明的公开接口发布 |
| `PLAT-X002` | 将 HiAgent 3.0 DataAgent、组织/KPI、Multi-Agent、Canvas 3.0 等营销描述视为当前能力 | 当前目标依据固定为 HiAgent 2.5.1，本地资料未证明这些描述适用于目标环境 | 不进入当前需求、设计和验收；未来升级目标版本时另立调研与迁移任务 |
| `PLAT-X003` | 使用 frp、ngrok 等公网穿透连接本机银行演示环境 | 当前演示要求本机闭环，公网暴露增加不必要攻击面 | 本机使用隔离网络；未来云迁移只采用受控企业网络方案 |

## 5. 验证执行与证据约定

1. 所有平台一致性测试使用合成数据、回显端点和无业务副作用的 Skill/Plugin，不读取银行凭据、真实 PII、`.env` 或本机任意文件。
2. 计划中的测试定义统一放入 `platform/hengzhun-regression-system/tests/conformance/cases/PLAT-Vxxx.*`；`coze/` 只保存待上传/导入制品与公开界面配置清单。
3. 运行截图、网络记录和平台导出写入 `platform/hengzhun-regression-system/.data/evidence/conformance/<ID>/<runId>/`，整体禁止入库。
4. 可提交的脱敏结果清单写入 `platform/hengzhun-regression-system/tests/conformance/results/<ID>.json`，至少包含平台版本、制品 Hash、运行时间、结论和证据 Hash，不含 Token、Cookie、账号、绝对敏感路径和平台内部标识。
5. `PENDING` 只能由真实平台运行或明确的目标版本官方依据关闭；模型回答、二手文章、附件文本和单张界面截图不能独立关闭。
6. 某项失败只阻塞表中指定批次或依赖能力，不得反向阻塞无依赖的 Harness、SQLite、Artifact 或银行案例修复。

## 6. 批次退出门禁

| 批次 | 必须关闭的待验证项 |
|---|---|
| I1 | `PLAT-V001`、`PLAT-V002`、`PLAT-V003`、`PLAT-V009`、`PLAT-V013`；`PLAT-V006` 至少得到同步受理安全窗口 |
| I2 | `PLAT-V005`、`PLAT-V008` 的 Harness 侧边界测试；`PLAT-V004` 至少完成可导入契约验证 |
| I3 | `PLAT-V004` 七工具全量调用、`PLAT-V011` 会话恢复、`PLAT-V012` 首版知识链 |
| I4 | `PLAT-V014` 所有进入正式路由的 Midscene 动作 |
| I6 | `PLAT-V007` 容量边界和 `PLAT-V010` 云端迁移网络 |

## 7. 2026-07-16 I1 真实执行结论

本机已部署固定版本 Coze Studio 0.5.1，并仅通过公开界面完成最小 Agent、机械模型、合成 Knowledge Base、两节点 Workflow、试运行与发布。Coze 服务与合成一致性服务只通过内部 `hengzhun-control` 网络互通；健康、鉴权回显、机械对话和向量端点的受控探针通过。原始截图保存在忽略目录，提交结果仅保留 SHA-256。

| ID | 当前状态 | 真实结论 | 可提交证据 |
|---|---|---|---|
| `PLAT-V001` | `FAIL` | 当前公开界面没有可完成 `.skill`/`.zip` 同结构包上传、解析和发布的入口 | `tests/conformance/results/PLAT-V001.json` |
| `PLAT-V002` | `PARTIALLY_VERIFIED` | Agent 未获得隐式本地文件或 Node MCP 权限；受控 Plugin 等价路径因插件入口阻塞未完成 | `tests/conformance/results/PLAT-V002.json` |
| `PLAT-V003` | `PARTIALLY_VERIFIED` | OpenAPI、回显服务和参数测试通过；公开界面未进入可用的 Plugin/OpenAPI 导入表单 | `tests/conformance/results/PLAT-V003.json` |
| `PLAT-V006` | `BLOCKED` | 延迟档已实现，但因 Plugin 导入未建立，无法测得 Coze 的真实同步中断窗口 | `tests/conformance/results/PLAT-V006.json` |
| `PLAT-V009` | `RUNTIME_VERIFIED` | 内部网络仅含 Coze 服务与合成一致性服务，受控探针通过，未开放银行内部端口 | `tests/conformance/results/PLAT-V009.json` |
| `PLAT-V013` | `PARTIALLY_VERIFIED` | Agent、模型、Knowledge Base、Workflow 和发布通过；Skill/Plugin 交集未闭合 | `tests/conformance/results/PLAT-V013.json` |

因此，I1 机器基础已经可运行，但 I1 平台退出门禁仍未关闭。失败只阻塞 Skill 直接迁移、Plugin 参数实调和同步窗口测量；不得反向阻塞 I2 中不依赖 Coze 导入入口的 Harness、SQLite、Artifact 与安全内核开发。

## 8. 2026-07-16 I2 真实执行结论

I2 已完成 TypeScript/Node Harness、唯一 `regression_platform.sqlite`、七工具 OpenAPI、安全鉴权、namespace/runId 隔离、幂等、不可变审计、Artifact/Evidence 元数据和分级输出预算。12 项 Node 测试、TypeScript 编译、生产依赖审计和 Docker 内部网络运行检查均通过；Harness 无宿主机端口。

| ID | 当前状态 | 真实结论 | 可提交证据 |
|---|---|---|---|
| `PLAT-V004` | `PARTIALLY_VERIFIED` | 七工具 OpenAPI 通过无副作用可导入契约验证；Coze 公开资源库的创建菜单未进入插件表单，真实导入/发布/调用留到 I3 | `tests/conformance/results/PLAT-V004.json` |
| `PLAT-V005` | `HARNESS_VERIFIED` | 有效、缺失、错误、已轮换令牌和无泄露分支通过；Coze 公开配置注入随 I3 复验 | `tests/conformance/results/PLAT-V005.json` |
| `PLAT-V008` | `HARNESS_VERIFIED` | L0-L3 的 UTF-8 精确字节、分页和绝对上限通过；Coze 节点实测上限随 I3 复验 | `tests/conformance/results/PLAT-V008.json` |

I2 Harness 侧退出门禁已关闭。平台侧剩余事实没有被改写为成功：`PLAT-V004` 全量关闭仍是 I3 的硬门禁。

## 9. 来源边界

本登记册的待验证主张来自用户提供的 Coze/HiAgent 调研材料，但该材料不作为权威证据入库。HiAgent 已有依据只引用仓库中的 2.5.1 本地帮助文档；Coze 数字限制、云端网络要求和产品行为在真实验证前一律保持 `PENDING`。
