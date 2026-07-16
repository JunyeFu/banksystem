# Coze/Harness 自动化回归平台唯一实施顺序

<!-- IMPLEMENTATION_ORDER_AUTHORITY: v54-implementation-batches -->

本文件是当前项目**唯一实施顺序权威**。任务状态仍只以 [`agent/backlog.yaml`](../../backlog.yaml) 为准；架构、设计、验收矩阵、证据、历史计划和研究文档只能提供约束或证据，不得另行定义先后顺序。

## 控制规则

- 只有本文件可以定义项目级批次、先后关系、并行关系、入口条件和退出条件。
- `agent/backlog.yaml` 只记录任务状态、依赖、允许路径和验收标准，不复制批次顺序。
- `docs/`、`documents/`、`rag/`、`contracts/` 与其他 `agent/plans/active/` 文件只补充参数、接口、架构、技术方案、代码设计、验证方法或证据，不得建立第二套全局阶段编号或排期。
- 某个缺口报告、运行手册或测试案例中的“步骤”只约束该项操作，不构成项目实施顺序；若与本文件冲突，以本文件为准。
- 当前第一开发步骤是 **I1 的单目录产品骨架与 HiAgent 兼容制品规范**。I0 是与之并行的银行案例就绪门禁，不是 I1 的全局前置条件。

## 当前交付目标

实习交付物聚焦“以 Coze 为唯一用户入口的自动化回归测试平台”。复兴银行继续作为稳定、可演示的被测系统和个人作品集，不再要求整个银行前端、全部 S0—S7 或全部业务闭环完成后才启动平台开发。

## 并行轨道与门槛

两条轨道从现在开始并行：

- **平台轨道立即开工**：固定 Node/Playwright/Midscene/Chromium 运行时，部署本机 Coze Studio，建设 Harness、SQLite、Plugin、Worker 和证据链。它不依赖 `FE-DEFECT-001` 全部完成。
- **被测系统轨道按案例收敛**：只修复首批案例实际经过的页面、API、角色、Fixture、稳定定位器和错误恢复。未被首批案例使用的前端缺陷不得阻塞平台基础建设。

每个银行案例只有在接入 Harness 执行前才需要通过自己的案例门禁：

1. 入口路由和目标终态明确；
2. API、角色和错误语义与契约一致；
3. 合成 Fixture 可通过正式接口或 Test Support API 准备和清理；
4. 稳定 `data-testid`/ARIA/URL 可供 Playwright 使用；
5. 手工或现有自动化可重复通过，并能生成脱敏证据。

一个案例未通过只阻塞该案例，不阻塞 Harness、Coze Plugin、SQLite、Artifact、Worker 或其他已就绪案例。

## 实施批次

### I0：银行案例就绪门禁（与 I1 并行）

- 保护当前脏工作区，核对并提交现有银行修复；不混入平台运行态、凭据、日志和缓存。
- 固定首批三个低风险案例：
  1. 客户账号密码登录与个人资料一致性；
  2. 客户账户列表、账户详情与本人数据隔离；
  3. 错误凭据、无权限或会话失效后的安全拒绝与恢复。
- 内部转账、贷款、日终和运营审批保留为后续扩展，不阻塞实习最小闭环。

### I1：单目录产品骨架与平台基础（当前第一开发步骤）

- 在 `platform/hengzhun-regression-system/` 建立 `coze/`、`harness/`、`worker/`、`runtime/`、`contracts/`、`tests/`、`scripts/`、`docs/` 与 `.data/` 的单目录产品边界。
- 将现有 `platform/runtime` 复制为产品目录内的固定运行时并完成只读校验；新副本通过前不得删除旧运行时，旧运行时清理属于单独、可回滚动作。
- 建立统一 `package.json`、忽略规则、目录结构校验和一键验证入口；运行数据、日志、证据、凭据与缓存只进入 `.data/`，不得入库。
- 建立可上传 Skill、可导入 OpenAPI、公开界面配置清单和平台一致性测试目录；本地生成制品不得冒充 Coze/HiAgent 已安装或已发布证据。
- 部署本机 Coze Studio，完成模型、Knowledge Base、Agent/Workflow 的最小可用检查。
- 确认 Coze 容器到 Harness 的本机受控网络路径；不得暴露银行内部端口或凭据。
- 按 [`PLAT-V001`～`PLAT-V003`、`PLAT-V006`、`PLAT-V009`、`PLAT-V013`](../../../docs/current-state/coze-hiagent-verification-register.md) 完成 Skill、OpenAPI 参数、同步受理窗口、本机网络和 HiAgent 2.5.1 能力交集验证；未经验证的 Coze 独有能力不得进入实现。

I1 当前第一步的退出条件：目录结构校验通过、产品目录内固定运行时校验通过、`docs / rag / documents` 索引关系通过验证，并且没有写入或输出凭据。Coze Studio 部署与平台公开界面实测仍属于 I1 后续子步骤，不因本次骨架完成而被标记完成。

2026-07-16 实施状态：上述骨架、固定运行时、本机 Coze Studio 0.5.1、合成一致性服务、内部网络、最小 Agent、Knowledge Base 与 Workflow 已落地并验证。`PLAT-V009` 已运行通过；`PLAT-V001` 在当前公开界面失败，`PLAT-V003` 与 `PLAT-V013` 部分通过，`PLAT-V006` 受 Plugin 导入入口阻塞。因此 I1 的机器基础完成，但平台退出门禁未关闭；无依赖的 I2 Harness/SQLite/Artifact 工作允许继续，依赖 Skill/Plugin 导入的工作不得冒充完成。

### I2：Harness 最小安全内核

- 建立 TypeScript/Node Harness 服务、版本化 OpenAPI 和 Coze HTTP Plugin。
- 统一回归执行标识：每次请求必须携带受控 `namespace`，每次执行生成唯一 `runId`；二者贯穿任务、日志、Artifact、Evidence 和审计事件。
- 使用服务令牌、内网 allowlist、请求 Schema、幂等键、任务 ID 和审计事件。
- 建立 `regression_platform.sqlite` 迁移、WAL、外键、`busy_timeout`、单写入队列、备份和完整性检查。
- 建立 Artifact/Evidence 元数据、Hash、受管目录和禁止入库规则。
- 完成 `PLAT-V005` 鉴权负测、`PLAT-V008` 输出预算边界测试，并使 `PLAT-V004` 的七工具 OpenAPI 至少通过无副作用导入验证。

2026-07-16 实施状态：I2 Harness 最小安全内核已落地。正式七工具 OpenAPI、`namespace + runId`、服务令牌/allowlist、Zod Schema、幂等、任务与不可变审计、SQLite WAL/外键/`busy_timeout`/单写入/备份/完整性、Artifact/Evidence 元数据与 L0-L3 输出预算均通过自动验证；容器在内部网络健康运行且无宿主端口。`PLAT-V005`、`PLAT-V008` 的 Harness 侧门禁已关闭，`PLAT-V004` 已完成无副作用可导入契约验证。Coze Studio 0.5.1 公开界面的资源创建菜单仍未进入插件表单，真实导入、发布和七工具调用按本文件留在 I3，不能冒充已经完成。

### I3：第一个纵向闭环

完成以下可演示链路：

```text
用户自然语言
-> Coze Agent / Workflow
-> Harness HTTP Plugin
-> Playwright Worker
-> 复兴银行门户
-> 断言、截图、日志、Hash
-> Harness 任务结果
-> Coze 对话返回
```

第一条案例使用“客户登录与个人资料一致性”。在本批次完成前，不铺开视频导入、自动修复、定时调度或衡准 UI。

I3 退出前必须关闭 `PLAT-V004` 七工具真实调用、`PLAT-V011` 会话中断恢复和 `PLAT-V012` 首版知识检索审计链。

### I4：三案例与 Midscene

- 三条首批案例全部通过独立 BrowserContext、Fixture 隔离和脱敏证据验收。
- 接入模型驱动 Midscene 和 Harness 三动作窗口；先覆盖 LOW/MEDIUM 操作。
- 高风险动作仅允许 Midscene 定位，必须由 Playwright 完成 DOM/ARIA 唯一性检查和提交；首批低风险案例不强行制造资金写入。
- 已验证脚本标记为 `SCRIPT_VALIDATED`，未经验证不得进入正式回归。
- 只有通过 `PLAT-V014` 稳定性门禁的 Midscene 原子动作才能进入正式 LOW/MEDIUM 路由；开放式 `aiAct` 不得因模型自报成功而放行。

### I5：实习增强能力

按价值顺序追加：结构化案例导入、失败分类、脚本失效诊断、隔离修复候选、Coze 人工确认激活。本机视频拆帧和语言修复在基础闭环稳定后加入。

### I6：调度、离线与后续扩展

- Harness Schedule 只执行 `SCRIPT_VALIDATED` Playwright 脚本，正式定时运行不调用 LLM、Midscene 或视觉模型。
- 完成互斥、misfire、补跑、失败暂停、备份恢复和离线迁移包。
- 再逐步增加转账、贷款、日终、审批等银行案例。

## 明确不阻塞当前开工的事项

- `FE-DEFECT-001`、`FE-DEFECT-004`、`FE-DEFECT-006` 的全量完成；
- 银行所有页面与全部 S0—S7 的最终验收；
- 转账状态机收敛、贷款全生命周期和银行核心全量回归；
- 视频导入、五类外部适配器、自动修复、定时调度和内网离线包；
- 衡准任何页面、投影、路由迁移或写控制。

上述事项可能阻塞对应扩展功能，但不得反向阻塞 I1—I3。

## 排除范围

`HZ-OBSERVABILITY-001` 保持 `BLOCKED`。衡准不创建或编辑案例、知识、脚本、基线、调度和恢复，不支持 Coze Agent，也不控制 Harness。仓库 `docs/` 与 `rag/` 只服务开发，交付系统运行时知识只来自 Coze Knowledge Base。

## 验收依据

- [`docs/architecture/overview/coze-harness-midscene-observability-boundary.md`](../../../docs/architecture/overview/coze-harness-midscene-observability-boundary.md)
- [`docs/architecture/v54-coze-harness-acceptance-matrix.md`](../../../docs/architecture/v54-coze-harness-acceptance-matrix.md)
- [`docs/current-state/coze-hiagent-verification-register.md`](../../../docs/current-state/coze-hiagent-verification-register.md)
- [`contracts/openapi/test-support-api.yaml`](../../../contracts/openapi/test-support-api.yaml)

发生冲突时，实施顺序以本文件为准，任务状态以 `agent/backlog.yaml` 为准，接口以 `contracts/` 为准，当前能力以运行证据和 `docs/current-state/` 为准。
