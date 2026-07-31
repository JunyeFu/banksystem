---
id: DOC-ARCH-HENGZHUN-DIFY-HIAGENT-PORTABLE-V1
title: 衡准 Dify 到 HiAgent 便携式回归系统架构基线 V1
document_type: architecture-baseline
domain: regression-platform
status: superseded
authority: historical
version: 1.1
effective_date: 2026-07-20
owner: project-owner
supersedes:
  - DOC-ARCH-COZE-HIAGENT-WORKFLOW-V1
---

# 衡准 Dify 到 HiAgent 便携式回归系统架构基线 V1

> 2026-07-20 起本文已被 [`flowise-sqlite-hiagent-regression-baseline-v1.md`](flowise-sqlite-hiagent-regression-baseline-v1.md) 覆盖，只保留 Dify 候选阶段的历史决策，不得继续指导 I8 实现。
>
> 本文固化项目负责人于 2026-07-20 确认的最新目标架构。它覆盖既有文档中“Coze 作为演示入口”及“通过 OpenAPI/HTTP Plugin 直接访问 Harness”的未来目标设计，但不改写此前 Coze I1—I7 的历史实现和验收事实。
>
> 本文只定义架构、迁移、安全和便携性交付约束，不建立第二套实施排期。项目级批次、先后关系、入口条件和退出条件仍只能由 [`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md) 定义；该文件完成 Dify/MCP 重排前，不得依据旧 Coze 顺序继续新增平台能力。

## 1. 目标与适用范围

衡准自动化回归测试系统停止以网页端 Coze 作为目标入口，改用私有化 Dify 作为个人电脑和办公电脑阶段的主控平台。Dify 负责自然语言交互与工作流编排，HiAgent 是测试环境服务器阶段的最终运行平台和最高能力边界。

本基线适用于：

- Dify Agent、Workflow、知识、变量和模型配置；
- MCP 工具契约及其注册方式；
- Harness、本地执行器、Playwright、Midscene 和 Chromium 的职责划分；
- 个人电脑、办公电脑和测试环境服务器之间的制品迁移；
- 衡准系统的便携式、免安装式交付。

复兴银行继续作为被测业务系统，不被打包进衡准产品目录。

## 2. 需求优先级

发生冲突时按以下优先级裁决：

1. HiAgent 已证明的能力边界；
2. 安全、权限、凭据和审计边界；
3. MCP 作为平台外工具的唯一调用通道；
4. 跨计算机便携与可恢复性；
5. Dify 本地开发和演示体验；
6. 实现便利性。

任何无法在 HiAgent 中等价实现、注册、配置或验收的 Dify 能力，均不得进入正式实现基线。Dify 与其他需求冲突时，以 HiAgent 兼容约束为准。

## 3. 主控平台与工具调用边界

### 3.1 Dify 的职责

Dify 是个人电脑和办公电脑阶段的唯一自然语言入口，并通过 Dify Workflow 承担主控 LLM 编排。Dify 负责：

- 理解用户的自然语言回归需求；
- 将需求结构化为受控案例草案；
- 选择已批准的执行路线；
- 编排任务提交、状态查询和人工决策；
- 根据受控结果生成自然语言解释；
- 承载能够安全迁入平台、且 HiAgent 具有等价能力的参数处理和工作流逻辑。

Dify 不是浏览器执行器，不得直接接触本地文件系统、SQLite 文件、测试凭据、Playwright、Midscene、Chromium、Docker Socket 或操作系统命令。

### 3.2 MCP 唯一外部工具通道

Dify Workflow 访问 Dify 系统之外的任何工具时，只允许调用经过注册、鉴权和审计的 MCP 工具。禁止通过以下方式绕过 MCP：

- Dify 私有管理 API；
- Dify 内部数据库写入；
- 容器目录挂载注入工具；
- 任意 HTTP 节点直接访问 Harness；
- 代码节点调用操作系统、文件、数据库或浏览器；
- 将凭据、文件路径或数据库连接暴露给主控 LLM。

目标调用链固定为：

```text
用户
→ Dify Agent / Workflow
→ MCP Client
→ 衡准 MCP Server
→ Harness / Local Runner
→ Playwright / Midscene
→ 复兴银行
```

测试环境迁移后的目标链路为：

```text
用户
→ HiAgent Agent / Workflow
→ MCP
→ 测试环境衡准 Harness
→ Playwright / Midscene
→ 被测系统
```

### 3.3 Harness 能力重分配

Harness 现有能力按以下规则重新分配：

- 案例结构化、普通参数转换、计划展示和结果解释等无本地权限能力，优先迁入 Dify Workflow；
- 权限校验、幂等、任务状态机、租约、重试、审计、证据、Artifact、凭据别名和执行门禁继续由 Harness 管理；
- SQLite、Playwright、Midscene、Chromium、文件系统和测试凭据只能存在于 MCP Server、Harness 或 Local Runner 的受控边界内；
- MCP 工具只能暴露最小业务动作，不得暴露任意 SQL、任意文件读写、任意命令执行或任意浏览器脚本执行能力；
- Dify 和 HiAgent 只能得到受输出预算限制的状态、摘要、脱敏证据元数据及稳定标识。

“尽量搬上 Dify”不等于削弱安全边界。凡涉及本地资源、权威状态、敏感数据、不可逆操作或确定性执行的能力，必须保留在 Harness 一侧。

## 4. Dify 与 HiAgent 的强制兼容规则

Dify 只是开发、演示和迁移准备平台，HiAgent 才是最终能力标准。所有正式配置必须采用 Dify 与目标 HiAgent 版本的能力交集。

禁止依赖：

- HiAgent 没有等价节点的 Dify 专有工作流能力；
- 无法映射到 HiAgent 的变量、记忆、知识检索或会话语义；
- 只能由 Dify 私有 API 创建、修改或发布的资源；
- 无法在 HiAgent 公开界面或正式接口完成注册的 MCP 能力；
- Dify 特有的隐式重试、异常吞并、上下文保持或工具调用行为；
- 以 Dify 运行成功代替 HiAgent 真实验收。

每一项进入正式基线的 Dify 配置必须同时具备：

1. 对应的 HiAgent 能力依据；
2. Dify 与 HiAgent 参数映射；
3. 可迁移配置或同源生成规则；
4. 不兼容项检测方法；
5. 目标 HiAgent 环境的重新注册、调试、发布和验收步骤。

在 HiAgent 中尚未取得证据的能力只能登记为待验证项，不得写成可用事实。

## 5. 非安装式便携交付

衡准采用高度集成、依赖自带的文件夹制品交付。正式交付物必须能够压缩、复制到另一台受支持的 Windows 计算机、解压、填写必要配置并通过统一入口启动。

交付包必须满足：

- 不要求用户手动安装 Node.js、Python、Playwright、Chromium、Dify 或 SQLite；
- 固定版本运行时、浏览器、依赖、Dify 运行组件、MCP Server、Harness 和启动工具随包提供；
- 不依赖目标计算机已有的全局开发环境、缓存、容器或绝对路径；
- 自动检查端口、磁盘、目录权限、运行时 Hash、版本和依赖完整性；
- 提供统一的准备、启动、停止、诊断、验证、备份和恢复入口；
- 程序文件与运行数据分离，运行数据只能进入受控运行态目录；
- 凭据、测试账号、令牌和环境差异不进入源代码、Git 或通用压缩包；
- 目标计算机只需完成必要的安全配置注入，不执行源码编译或依赖联网下载；
- 迁移前后必须通过相同的机器可读验收。

本项目所称“无需本地部署”统一解释为：

> 用户不需要执行传统安装、依赖下载、源码编译或手工配置多项服务；解压制品并运行统一入口后，由产品自带组件自动完成本机服务准备与启动。

该表述不代表系统不运行本地服务，也不允许隐瞒 Dify、MCP Server、Harness、Worker 或浏览器运行时的实际存在。

## 6. 三阶段迁移流程

项目环境流转固定为：

```text
个人电脑（Dify）
→ 办公电脑（Dify）
→ 测试环境服务器（HiAgent）
```

### 6.1 个人电脑阶段

个人电脑用于：

- Dify Workflow 和主控提示设计；
- MCP 工具契约与 MCP Server 开发；
- Harness、Local Runner、Playwright 和 Midscene 联调；
- 复兴银行本地案例验证；
- Dify—HiAgent 能力映射检查；
- 便携式制品生成及本机恢复验证。

本阶段成功只证明个人电脑上的 Dify 演示和本地执行链路，不证明办公电脑或 HiAgent 已可用。

### 6.2 办公电脑阶段

办公电脑用于验证真正的跨计算机便携性：

- 从压缩包恢复完整衡准运行环境；
- 在无全局开发依赖条件下启动 Dify、MCP、Harness 和 Worker；
- 重新注入环境配置与凭据；
- 导入或重建 Dify Agent、Workflow、知识和 MCP 配置；
- 执行真实演示案例；
- 检测个人电脑绝对路径、缓存、容器状态和隐式依赖；
- 生成目标 HiAgent 所需的迁移制品与配置清单。

办公电脑不得直接复制个人电脑的凭据、运行数据库、缓存或未脱敏证据。

### 6.3 测试环境服务器阶段

测试环境服务器用于：

- 根据映射规则将 Dify 配置重建为 HiAgent Agent、Workflow、知识和 MCP 配置；
- 通过 HiAgent 正式入口注册、调试和发布 MCP 工具；
- 将 Dify 主控替换为 HiAgent 主控；
- 将测试环境 Harness、Runner、Playwright 和 Midscene 接入同一受控网络；
- 重新执行安全、契约、功能、证据和恢复验收；
- 形成 HiAgent 环境独立证据，不复用 Dify 成功结论。

## 7. 制品与配置边界

便携包至少应包含：

```text
hengzhun-regression-system/
├── dify/            Dify 可导入配置、同源定义和兼容性映射
├── mcp/             MCP Server、工具 Schema 和权限策略
├── harness/         权威状态、安全、任务、证据和审计
├── worker/          Playwright、Midscene 与执行适配器
├── runtime/         固定运行时、Chromium 和离线依赖
├── contracts/       MCP、任务和结果契约
├── migration/       Dify → HiAgent 映射与目标环境清单
├── tests/           单元、契约、集成、E2E 和迁移验收
├── scripts/         准备、启停、诊断、验证、备份和恢复
├── docs/            产品目录内部运行说明
└── .data/           运行数据、日志和证据，不进入通用制品或 Git
```

Dify 和 HiAgent 的平台资源 ID、凭据、会话、内部数据库和运行态索引不得作为跨环境通用制品。跨平台迁移采用“同源定义 + 参数映射 + 重新注册 + 重新验收”，不宣称平台内部状态可以原样克隆。

## 8. 验收原则

本架构落地至少满足：

1. Dify 之外的工具调用全部经过 MCP；
2. 每个 Dify 能力都有 HiAgent 对应依据和映射；
3. HiAgent 无对应能力的 Dify 特性使用数量为零；
4. LLM 无法访问任意文件、SQL、命令、凭据或浏览器脚本执行接口；
5. Harness 权威状态、审计和证据链未因能力迁移而弱化；
6. 个人电脑压缩包可在办公电脑离线恢复并通过同一套验收；
7. 办公电脑成功不自动证明 HiAgent 成功；
8. 测试环境必须重新完成 MCP 注册、网络、鉴权、调用和回归验收；
9. 所有凭据只通过目标环境的受控配置注入，不进入仓库和通用交付包；
10. 当前能力、目标设计和历史证据在文档中保持明确区分。

## 9. 与既有文档的关系

- [`../coze-hiagent-workflow-design-v1.md`](../coze-hiagent-workflow-design-v1.md) 中以 Coze 为未来入口、以 OpenAPI Plugin 为主要平台外通道的目标设计，自本文生效后不再作为当前目标架构；其历史背景和已完成证据仍可引用。
- [`coze-harness-midscene-observability-boundary.md`](coze-harness-midscene-observability-boundary.md) 记录的 Coze I1—I7 实现事实继续有效，但其未来平台职责边界由本文覆盖。
- 当前能力仍以代码、测试、运行证据和 [`../../current-state/capability-matrix.md`](../../current-state/capability-matrix.md) 为准；本文不把 Dify/MCP 目标设计写成已经实现。
- 唯一实施顺序文件必须在下一次开发前完成 Dify/MCP 重排；其他架构、设计、证据和研究文件不得自行建立新批次。
