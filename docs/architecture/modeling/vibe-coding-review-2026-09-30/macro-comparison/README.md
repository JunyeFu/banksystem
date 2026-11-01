---
id: DOC-BANK-MACRO-MODEL-20260930
title: 业务模块宏观对比工程图册
document_type: reference
domain: architecture
status: reviewed
authority: informative
version: 1.0
effective_date: 2026-09-30
owner: project-owner
---

# 业务模块宏观对比

直接打开 [完整图册](index.html) 或 [可编辑 draw.io 四页源文件](macro-business-comparison.drawio)。本轮将上一轮代码级复盘提升为模块级视图，不修改产品代码、服务、数据、身份或任务状态。

| 图种 | 问题 | 比较口径 |
|---|---|---|
| [业务能力地图](01-capability-map.svg) | 两个产品需要哪些业务能力？各能力具体缺在哪里？ | 同一能力布局：目标承诺 vs 当前代码，不计算无依据的完成百分比 |
| [UML 组件分层图](02-uml-component.svg) | HTTP、应用服务、业务模块、存储、核心端口分别负责什么？ | 同一 Bank Channel 容器内逻辑组件；虚线为依赖，红色为已观测职责泄漏 |
| [业务上下文与所有权图](03-context-ownership.svg) | 核心账务、渠道工作流、测试状态分别由谁拥有？ | 相同宏观权威边界；它不是物理 ER，也不是宣称整个项目已完成 DDD |
| [DSM 依赖结构矩阵](04-dependency-dsm.svg) | 模块类型依赖是否双向？注册表与代码一致吗？ | 左侧既有声明 allowedDependencies，右侧当前显式 Java import；不把旧声明冒充已修正理想模型 |

## 专业记号与阅读方式

UML 组件视图采用组件符号及虚线依赖箭头，规范依据为 [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1)。这里只使用组件/依赖的常用子集，不宣称已完成 UML 全模型语义验证。一个容器内部的组件职责视图也符合 [C4 组件层的观察范围](https://c4model.com/diagrams/component)；没有把 Java 包误当成独立部署容器。

DSM 采用“行模块依赖列模块”的明确约定，与 [DSM 方法说明](https://dsmweb.org/introduction-to-dsm/)中的有向关系矩阵表示一致。对称标记或强连通组提示编译依赖环；**不是运行递归、死锁或资金损坏的证明**。

目标是依据当前 AGENTS.md、ADR-004 和已接受产品要求表达的职责；实际依据上一轮 [M01–M17 审查](../review.md)及本轮主源码依赖提取。绿色表示目标承诺；蓝色表示有代码；黄色表示已知边界/恢复问题；红色表示明确语义或功能差距。这些不是运行完成等级。

## 宏观解释，而不是机械删依赖

- 贷款模块的主要差距是**业务条件和数值单位在核心边界丢失**，不是缺少一个新的目录。
- 支付主链已有分阶段事务与未知结果处理；仍需收敛 HTTP 层查询语法和事务内核心读取。
- EOD 依赖支付待办、对账、审计是其应用协调职责；错误在日期绑定、远程检查点与命名超出能力，而不是“依赖多个模块”本身。
- Java 类型依赖可能成环。可将风险判断与支付状态推进的责任分开，也可调整 EOD HTTP 入口归属；具体修复需再核对行为合同，不能看到红格就直接删除调用。
- 注册表中的空依赖清单不是当前合法协作的可靠理想图。先校正声明，再决定哪些实现依赖真的违反目标。
- Fineract 核心账务、Channel 业务状态、Harness 测试状态是三个不同权威；本地渠道投影不能冒充核心总账，Quality 页面也不能成为第二个测试写控制面。

## 来源与验证

本轮静态观察：62 个 Java 文件提取 14 条唯一跨模块 import 边，其中 11 条未进入现有 allowedDependencies 声明。支付、风险、运营/EOD 形成一个强连通组。最小路径是 `TransferProcessor→RiskService→TransferStateMachine` 与 `payments.EodController→operations.EodCoordinator→payments.EodRepository`；每条边对应路径/行号见证据 JSON。这是新增的模块结构观察，不是新增资金损坏结论。

`dependency-evidence.json` 每条依赖保留相对源码路径、行号和 import 文本。扫描仅限 `services/bank-channel-service/src/main/java/local/bank/channel` 下的 11 个生产领域包，包括主源码中的条件启用类；它是源码依赖而非默认运行拓扑。根目录核心端口、Test Support、前端、MCP、SQL 表引用、反射与运行时 HTTP 关系不纳入 DSM，因此空格不证明完全解耦。

本地图像由同源模型生成 SVG/PNG，不使用 AI 绘画来猜测模块或文字。原生 draw.io 为首要可编辑交付；SVG/PNG 是预览，没有冒称经过 draw.io Desktop 导出。本轮无需安装额外渲染器或上传源码。

重建：`node build.mjs`。PNG 可选：`node build.mjs --png-module <已安装的sharp模块绝对路径>`。必需文档校验：在仓库根运行 `python scripts/docs/validate_docs.py`。
