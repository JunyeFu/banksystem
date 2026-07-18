---
id: DOC-ARCH-COZE-HARNESS-BOUNDARY
title: Coze、Harness、Midscene 与衡准职责边界基线
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.7
effective_date: 2026-07-18
owner: project-owner
---

# Coze、Harness、Midscene 与衡准职责边界基线

> 本文固化项目负责人确认的最新产品理解。它覆盖现行文档中与 Codex/GPT 运行时作者化、衡准可写控制面、外部 Agent 禁用相关的旧表述，但不构成功能已实现证明。实施顺序只以 [`../../../agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md) 为准。

## 1. 已确认的产品边界

1. **Coze 是唯一的业务 Agent 编排入口。** 自然语言、外部平台案例、视频案例、知识、澄清、计划、恢复决策和对话式任务控制均由 Coze 内的自定义 Agent/Workflow 编排。
2. **Harness 是本机工具链执行与安全控制层。** Harness 向 Coze 暴露收敛、结构化、可审计的工具，负责参数校验、权限、幂等、任务状态、上下文裁剪、安全门禁、工具执行和证据采集；Harness 不是第二个业务 Agent 平台。
3. **Midscene 是视觉操作 Agent。** Midscene 必须接入具备截图理解和 UI grounding 能力的视觉/多模态模型；它不是无模型的浏览器工具，也不能被等同为 Playwright helper。
4. **Playwright 是确定性执行与验证底座。** 低/中风险操作由 Midscene 执行时，Playwright 同步取证和验证；高风险操作由 Midscene 定位、Playwright 对齐 DOM/ARIA 并提交。正式定时回归只运行已验证的 Playwright 脚本。
5. **衡准只作为图形化指标与证据观测平台。** 衡准不创建或编辑案例、知识、Agent、Workflow、脚本、基线、调度或恢复决策，不向 Coze Agent 提供支持服务，也不控制 Harness 任务。
6. **Codex 只作为开发 Agent。** Codex 用于设计、开发、测试和维护项目，不是演示系统运行时的作者化主体、业务编排主体或回归执行主体。
7. **复兴银行是被测目标系统。** Coze 与 Midscene 不直接获得银行内部凭据、数据库、Shell 或任意网络能力；所有实际操作通过 Harness 受控工具和正式/Test Support 接口完成。
8. **Harness 的 SQLite `regression_platform` 数据库是回归测试领域唯一事实来源。** 案例版本、完整行动计划、脚本版本、基线、运行、调度、事故、修复候选、激活决定、审批记录和证据元数据只以该数据库为权威；Coze 只保存 Agent 配置、会话和 Workflow 编排状态。SQLite 文件是本机受管运行态，不入库，使用 WAL、外键、单写入队列和完整性校验。
9. **Coze Knowledge Base 是运行时唯一知识权威。** 已交付系统中的 Coze Agent、Harness、Midscene 和衡准不得检索、同步或回退到仓库 `docs/`、`rag/` 或其索引；这些文件仅用于项目开发、审计和 Codex维护。
10. **本对话只交付本机演示系统。** 当前实现和验收止于本机 Coze、Harness、SQLite、Playwright、Midscene 与复兴银行；HiAgent 不在本机部署，也不在本对话配置或验收。面向 HiAgent 的 Skill、OpenAPI、配置清单、契约和手册只是未来新对话的提取输入。

Coze 中为对话或 Workflow 暂存的业务对象只是缓存或引用，不得成为第二份权威数据。Coze 对测试领域状态的读取和变更必须调用 Harness 的版本化、幂等工具；衡准只读取 Harness 提供的查询模型或观测投影。禁止 Coze、Harness 和衡准之间双写同一业务实体。

Harness 可在 Retrieval Snapshot 中记录 Coze知识库的空间、资料集、版本、检索请求和结果Hash，以便审计和回放；这类记录只保存引用和证据，不复制知识正文，也不构成第二知识库。向Coze导入或更新知识必须由Coze内的受控流程完成，并记录可追溯的Coze版本标识。

## 2. 目标调用链

```text
用户
-> Coze 自定义 Agent / Workflow
-> Harness 工具协议与安全控制
-> MidsceneContextWindowControlLayer
-> Midscene 视觉操作 Agent + 视觉/多模态模型
-> 绑定的 Playwright Page
-> 复兴银行

同时：
Harness/Coze -> 观测事件与证据投影 -> 衡准只读展示
```

正式回归链路与作者化链路分离：

```text
作者化/重新作者化：Coze -> Harness -> Midscene + 视觉模型 + Playwright -> 已验证脚本
正式定时回归：Coze Trigger -> Harness Schedule -> 已验证 Playwright 脚本
```

正式定时回归不得调用主控 LLM、Midscene 或视觉模型。发生脚本失效后，才重新进入 Coze 编排的诊断与作者化流程。

Harness 是定时任务权威：保存 Schedule、IANA 时区、互斥锁、misfire 与补跑语义；Coze 仅通过版本化 Harness 工具创建、查询和停用 Schedule。

## 3. Midscene 三动作上下文窗口

`MidsceneContextWindowControlLayer` 是本项目在 Harness 内建设的控制层，不是 Midscene 库的原生长期记忆，也不是 Coze 会话记忆的复制。

完整 `FullActionPlan` 由 Coze 形成，通过 Harness 持久化至权威 SQLite 存储。Harness 持有游标，每次只向 Midscene 视觉 Agent 提供：

```text
GlobalExecutionSummary
previous 动作摘要
current 动作完整定义
next 动作简要预告
lastObservation
currentPageState
当前截图
currentLease
```

不得提供完整历史、完整未来计划、其他案例、完整 RAG 文档、Secret、Token、Cookie、Storage State、真实 PII 或数据库凭据。

游标只在 `ACTION_VERIFIED_PASSED` 后前进；失败、歧义和租约过期时保持当前动作。每个 `ReplicationRun` 同时最多一个活动 `ActionExecutionSlot`，防止跳步、并发执行和重复提交。

Midscene 原生缓存仅用于缓存模型规划或元素定位结果，不能替代上述窗口、租约、业务状态或验证机制。

## 4. 风险路由

| 风险 | Midscene 视觉 Agent | Playwright |
|---|---|---|
| LOW | 仅在相应原子能力通过 `PLAT-V014` 时定位并执行；否则不参与 | 同步监听、取证和验证；能力降级时独立执行 |
| MEDIUM | 仅在相应原子能力通过 `PLAT-V014` 时定位并执行；否则不参与 | 强制网络、DOM、页面和业务验证；能力降级时独立执行 |
| HIGH | 仅在 `LOCATE` 已验证时提供视觉定位，永不直接提交 | DOM/ARIA 对齐、唯一性检查、风险门禁后提交；`LOCATE` 降级时独立执行 |

转账确认、审批、冲正、核销、日终、批量提交、权限变更和删除等高风险动作不得由 Midscene 直接提交。

## 5. 衡准只读观测边界

**实施状态：暂缓。** 衡准的最终职责边界保持不变，但其页面和观测投影实现不属于当前实习交付范围。衡准必须等待 Coze 唯一入口和 Harness 回归核心验收；复兴银行未被首批案例使用的前端缺陷不影响平台基础建设，也不改变衡准暂停状态。

衡准可以展示：运行状态、通过率、失败分类、脚本稳定性、模型与工具耗时、修复候选及验证结果、环境健康度、证据完整率、发布质量门和审计链。

衡准不得提供：案例/知识写入、Agent/Prompt/Workflow 配置、工具注册、脚本生成或激活、基线审批、调度启停、运行重试、恢复选择或修复审批。

因此当前 Quality Case Portal 中的创建案例、基线决策、Schedule 启停等写操作不属于最终衡准产品边界；所有现有路由保留，但页面改为只读投影，操作入口迁移到 Coze 交互流程。

## 6. 与历史原始设计的比较结论

| 原始设计 | 最新理解 | 判断 |
|---|---|---|
| 早期 Agent 设计接收三类案例并进行对话式控制 | Coze 是唯一业务 Agent 编排入口 | 一致，最新理解恢复了原始职责 |
| 主控 LLM 生成 `FullActionPlan`，Harness 做确定性约束 | Coze 内模型推理，Harness执行工具和门禁，`regression_platform` 保存权威版本 | 一致，且已消除状态双写风险 |
| Midscene `PlaywrightAgent` 接视觉模型执行视觉动作 | Midscene 是独立视觉操作 Agent并接多模态模型 | 一致，且纠正了“普通工具”误解 |
| 外部控制器强制 previous/current/next 与单动作预算 | Harness 内建设上下文窗口控制层 | 一致且合理 |
| 高风险 Midscene Locate + Playwright Commit | 保留相同风险路由 | 一致，适合银行写操作 |
| 作者化平面与正式回归执行平面分离 | 正式回归只运行已验证脚本 | 一致且必须保留 |
| 原始设计包含 Authoring Review Web 和平台写操作 | 衡准只读，交互迁入 Coze | 有意变更；需要明确数据权威和审批承载位置 |
| 原始设计允许 Coze/企业 Agent Adapter | 当前明确只使用 Coze | 范围收敛，合理，但降低平台可替换性 |

## 7. 对现行规划的覆盖

以下现行内容已不再有效：

- Codex/GPT 是运行时作者化控制面的表述；
- 禁止使用外部 Agent 控制面的表述；
- 衡准负责 Case、Knowledge、Baseline、Schedule、Incident、Recovery 写操作的表述；
- B5/B6 以 Codex/GPT 作者化链作为验收主体的表述；
- 将 Midscene 描述为无状态浏览器工具的表述。

当前开发排期只以 `agent/backlog.yaml` 和 `agent/plans/active/v54-implementation-batches.md` 为准；已删除的 B0-B7 不得恢复为执行依据。

## 8. 已确认的实现参数

### Q1 状态权威（已确认）

采用 Harness 自有 `regression_platform` 数据库作为回归测试领域唯一事实来源。Coze只保存 Agent 配置、会话和 Workflow 编排状态；衡准只读取 Harness 查询模型或观测投影。Artifact/Evidence 原始文件保存在本机受管存储，数据库保存其元数据、Hash、版本、访问和保留记录。

### Q2 知识权威（已确认）

Coze Knowledge Base 是运行时唯一知识权威。仓库 `docs/ + rag/` 仅服务项目开发、审计和Codex维护；不得在产品运行时被Coze、Harness、Midscene或衡准读取、同步或作为回退源。Harness只记录Coze知识版本和检索证据引用，不保存知识正文副本。

### Q3 调度权威（已确认）

Harness 保存确定性 Schedule；Coze 只经版本化工具创建、查询和停用。Harness 负责断网重启、misfire、互斥锁和补跑语义。

### Q4 Midscene模型分工（已确认）

采用可迁移的双 Profile：默认视觉模型负责 grounding，Planning/Insight 按需启用；主控与视觉模型的实际标识、Endpoint、认证只在部署配置中注入，不写入代码或仓库。实现前仍需用目标模型完成图像输入与 grounding 能力 Smoke。

### Q5 截图与外部模型边界（已确认）

允许经本机脱敏的最小截图发送至外部视觉模型；浏览器、Worker、证据和实际操作始终保留本机。全封闭内网部署必须切换到本机视觉模型，禁止截图出域。

### Q6 修复激活门禁（已确认）

Coze 可独立诊断并让 Harness 验证修复候选，但正式脚本替换和 Schedule 恢复必须由用户在 Coze 中确认；不得自动激活。

### Q7 衡准页面处置（已确认）

保留全部现有路由，改为只读详情/观测页面；原写操作入口跳转或引导至 Coze。

### Q8 Coze与Harness工具协议（已确认）

Coze Studio 以自托管方式部署，使用 HTTP OpenAPI Plugin 调用 Harness；采用服务令牌与内网 allowlist 鉴权。长任务由 Harness 返回任务 ID，通过查询/回调收敛状态；文件只以本机 Artifact ID 传递，视频拆帧不出本机。

工具输出采用已确认的四级预算，按完整 JSON 响应体 UTF-8 序列化后的压缩前字节数计量：L0 状态默认 4 KiB、上限 8 KiB；L1 回执默认 8 KiB、上限 16 KiB；L2 详情默认 32 KiB、上限 64 KiB；L3 元数据默认 64 KiB、上限 128 KiB。`task_get` 固定为 L0，创建/提交/决策和异步受理固定为 L1，案例与诊断详情为 L2，Artifact 元数据为 L3。Harness 的应用层绝对上限为 128 KiB；HiAgent 2.5.1 的 2 MiB 插件限制只作为平台最终防线，不作为可用预算。达到等级上限时必须在完整条目边界分页，或把正文转入 Artifact 并返回引用；禁止静默截断 JSON、UTF-8 字符和单条记录，无法安全降级时返回 `OUTPUT_BUDGET_EXCEEDED`。

Coze 的 Skill 制品兼容、OpenAPI Schema 支持、超时/配额/数据大小、网络可达、会话恢复、知识检索和 MiMo 作者化稳定性不得从调研文本直接推定。它们的状态、验证动作和批次门禁统一以 [`Coze 模拟 HiAgent 平台能力待验证登记册`](../../current-state/coze-hiagent-verification-register.md) 为准；未关闭项只能阻塞依赖能力，不能扩张或改变本文职责边界。

### Q9 SQLite 统一存储（已确认）

所有新建 Harness、衡准和回归平台持久化统一使用本机 SQLite。`regression_platform.sqlite` 是唯一回归领域事实来源，采用 WAL、外键、`busy_timeout`、单写入队列、迁移前备份和 `PRAGMA integrity_check`。不允许多个容器/进程绕过 Harness 并发写同一文件；数据库文件、WAL/SHM 文件与备份均为运行态，禁止入库。该决定不替换既有 Fineract/Mifos 和银行渠道 PostgreSQL 核心依赖。

### Q10 对话与 HiAgent 移交边界（已确认）

当前对话只继续维护和验收本机演示系统，不执行 HiAgent 账户登录、平台配置、资源注册、网络接入、容量测量或目标环境发布。未来新对话必须从当前已提交实现中提取兼容制品，在实际 HiAgent 环境重新验证能力交集；不得把 Coze 运行证据直接转换为 HiAgent 完成证明。`PLAT-V007` 与 `PLAT-V010` 随 HiAgent 工作一并移交，不属于本机 I1—I7 的未完成项。
