---
id: BANK-LIFECYCLE-WORKBENCH-20261008
title: Engineering lifecycle workbench and domain reading map
document_type: reference
domain: current-state
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-08
owner: project-owner
---

# 银行 + CLI Agent：工程生命周期工作台

2026-10-08初次交付为知识准备与开发辅助站点。此后用户已逐步确认产品要求并授权整项目规范化实施；这些确认是需求输入，不是课程完成记录。当前正式源稿见[规范化总览](../design/product-normalization/README.md)和[需求规格N01—N12](../design/product-normalization/requirements.md)。行业调研假设、材料撰写、主体实现、真实运行验收分别记证据，不自动等同正式发布。

## 使用与状态来源

2026-10-08按用户新边界迁移至 `D:\Agent\project-navigation\bank-interview`，运行 `python D:\Agent\project-navigation\bank-interview\server.py`，访问 `http://127.0.0.1:24181`。站点在外部维护面试准备、笔记与学习安排；本项目只提供只读资料。下文原生命周期建设排期与验收记录作为迁移前历史保留。

工作台包含12阶段、60条细化检查、13个一手阅读入口、PRD准备和工程反思。阶段逐项记录角色、动作、交付物、完成门、证据来源、当前缺口；个人笔记与自评保存在本浏览器，可导出/导入JSON。不连接银行写接口、不访问Harness数据库，也不承接正式验收裁决。

- 正式任务状态唯一来源：[backlog](../../agent/backlog.yaml)。
- 项目实施仍由[唯一实施顺序](../../agent/plans/active/v54-implementation-batches.md)控制；外部站点两周安排仅用于面试准备。
- 评估基线：外部项目导航工作区的 `bank-interview/data.js`。这是证据覆盖评估，不是新的任务台账；变更须重新核对证据。
- 页面源码与运行说明：同一外部工作区的 `bank-interview/README.md`；不属于银行仓库，不要求产品克隆包含它。

“已验证”仅指列明的窄范围事实；“部分完成”表示存在实现或材料但未覆盖本项完整验收；“待核验”表示本轮没有足够证据，不表示从未做过；“未开始”表示本轮拟补齐、尚未提供产物的活动。个人认为完成不自动改变正式状态。工作台不计算一个混合文档/代码/运行结果的产品完成百分比。

## 当前证据冲突必须显式保留

2026-10-12增量：RF065-S1/S2既有本地证据保留；S3身份漏项和Midscene CLI安装耦合已修复，身份19/19、隔离Worker27/27、实际新runtime/Chromium通过，秘密扫描2421文件/0发现。在线九锁仍失败80处/82公告，BOM919组件/22library许可缺项；两轮网络冷下载TLS失败，缓存兼容复验不能代替冷下载。CI扫描失败接线已实施、远端未执行；[局部修复与复验](../architecture/refactoring/batches/RF-065/dependency-remediation.md)已登记。外部面试站同步当前NO_GO，不改个人记录或替你确认贡献。

[能力矩阵](capability-matrix.md)开头仍是10月2日B13失败快照；[RF063证据索引](../architecture/refactoring/batches/RF-063/evidence-index.md)10月7日增量已记录新现金会计基线、业务14/14及后续未完成发布验收。站点优先展示更新的增量证据，同时说明范围，不把历史业务通过换算成最终源码身份GO。

[根因复审](../architecture/refactoring/batches/RF-063/root-cause-and-review.md)M06/M08/M11等条目部分未回灌。本站不擅自删除旧失败事实。银行、Agent、性能、发布各自的当前完成门仍需在原RF063→RF057链中闭合。此次没有重新执行银行、BYOK或性能测试。

## 领域知识储备

检索日期：2026-10-07至08。只使用出版社、标准组织、官方产品文档和原作者工程文章；核实的是目录/官方介绍及相关页面，并非声称已通读付费教材。教材概念、参考架构、运行版本合同及现行法规不能互相替代。

| 资料 | 用来回答什么 | 本项目要产出什么 |
|---|---|---|
| [Sommerville, Software Engineering 10e](https://www.pearson.com/en-us/subject-catalog/p/software-engineering/P200000003258/9780138229399) | 工程活动如何贯通需求、设计、实现、测试与交付 | 阶段输入/活动/产物/退出条件；理解迭代而非补一条伪瀑布流程 |
| [IEEE SWEBOK v4](https://www.computer.org/education/bodies-of-knowledge/software-engineering) | 专业知识覆盖是否完整 | 覆盖检查框架；知识领域不等于必须按顺序执行的阶段 |
| [Wiegers / Beatty, Software Requirements 3e](https://www.informit.com/store/software-requirements-9780735679665) | 怎样让需求具体、可验证、可追踪 | 用例、业务规则、非功能需求、评审与双向追踪 |
| [Rose / Hudgins, Bank Management & Financial Services 9e](https://www.mheducation.com/highered/product/bank-management-and-financial-services-rose.html) | 存贷款、银行经营与风险的基础逻辑 | 角色/术语/业务背景；旧版教材不作为当前监管依据 |
| [BIAN Service Landscape](https://bian.org/deliverables/service-landscape/) | 银行业务能力怎样划分 | 对照客户、账户、支付、贷款、运营边界；不复制全量微服务 |
| [Apache Fineract API](https://fineract.apache.org/docs/legacy/) | 核心业务对象和会计接口的真实行为 | 对照运行版本验证账户、贷款、journal和job回读；避免本地假账务 |
| [Kleppmann / Riccomini, DDIA 2e](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/) | 事务、并发与分布式故障为什么难 | 分析幂等、未知结果、Outbox和EOD故障窗口，不为演示加多余分布式架构 |
| [Hur / Song, Build an AI Agent (From Scratch)](https://www.manning.com/books/build-an-ai-agent-from-scratch) | 如何理解Agent的组成与闭环 | 对照Controller、工具调用、记忆/状态、执行反馈；出版状态以官网为准 |
| [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | 工作流和Agent在哪里不同 | 区分模型自主作者化与固定脚本回归；不要给普通流水线贴Agent标签 |
| [ISTQB Performance Testing](https://www.istqb.org/certifications/certified-tester-performance-testing-ct-pt/) | 如何设计负载并解释性能结果 | 业务负载、并发、持续时间、分位数、资源与错误报告 |
| [Google SRE / Workbook](https://sre.google/books/) | 如何判断交付就绪、定义SLO和恢复责任 | 演示范围内的就绪评审、受控故障、恢复和交接，不宣称大厂生产级规模 |
| [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) | 安全活动怎样嵌入开发生命周期 | 认证、工具权限、秘密与依赖/制品检查；不是合规认证 |
| [SVPG Product Discovery](https://www.svpg.com/discovery-judgement/) / [PRD方法](https://www.svpg.com/wp-content/uploads/2024/07/How-To-Write-a-Good-PRD.pdf) | 如何区分价值、可用性、可行性和业务可持续性问题 | 产品假设、证伪实验与可验收PRD，而不是按页面反推需求 |

## 本项目的知识地图

1. **银行业务**：账户余额、账户交易、会计分录与对账不是同一个对象；转账完成必须依赖Fineract账务事实。贷款的年/月率、摊销方式、期数、还款、关闭需保留各自业务语义。结果未知不等于失败，也不等于允许重新扣款。
2. **测试产品**：自然语言目标、模型规划、工具调用、执行状态和可核验结果分层。Agent作者化可使用模型，正式固定脚本回归可以确定性执行；每个部分是什么由实际决策与反馈链决定，不由名称决定。
3. **工程方法**：需求定义正确性；模型解释业务；接口与模块隔离变化；测试尝试反驳实现；发布裁决检查完整证据。它们不应互相冒充。
4. **产品发现**：银行软件和测试工具是两个市场。当前默认定位为开源演示和工程学习/求职作品，不将其外推为受监管商业银行核心系统。竞品要按用户问题比较，不能把Fineract与测试Agent混入同一功能排行榜。

以上是面向现有实现的综合判断，不是某份教材的逐字结论，也不是已完成的市场验证。

## 待正式行业调研回答的问题

- 首要用户、使用场景、已有替代方案、痛点频率与影响分别是什么？真实访谈未发生则标假设。
- 对比Fineract/Mifos生态、传统Playwright测试、Agent测试工具三类样本，分别记录能力边界、部署、操作成本、执行可解释性和失败证据。
- 数据来源优先级：原始文档/实际试用与用户记录，高于厂商宣传，高于二手讨论。市场规模、价格和法规另查当前版本与适用地区。
- 候选价值指标：关键任务成功率、可复现安装成功率、测试目标到可执行案例的时间、失败定位时间、每次真实模型执行成本。当前没有测量的数值不得填入PRD作为已达成结果。
- 实际用户不能获取时，允许先做结构化假设与可用性演练，但不伪造访谈、客户或评审签名。

## PRD准备边界

本节下列“下一轮/后续输入”为10月8日初次准备的历史问题。当前用户、测试组周期回归场景、从真实登录到最终入账/双边余额的终点、异常先查询再失败/人工介入、AI应用/全栈展示方向均已确认并进入上述需求规格，不再要求重复澄清。机构实际部署环境、验证码具体机制、实测人力收益及本人贡献仍需相应事实，不能由源稿代填。

下一轮PRD应含：问题及证据、角色、定位、MVP及非目标、银行与Agent分别的成功/异常流程、编号需求、非功能约束、依赖、验收矩阵、版本与开放问题。研究结论、产品决策和实现事实分别标注。

尚需用户后续明确：目标行业/地区与岗位、重点用户、是否保持现有业务范围、希望调研的竞争产品、时间/模型预算。本站提供输入区和研究提示词，不因这些输入尚未给出而停止搭建知识框架。

## 两周完成定义

覆盖行业研究→产品定义→需求→建模→架构/安全→交互→计划/环境→实现/评审→验证/性能→UAT→发布准备→交接/复盘。作为常见工程实践参考，不代表任何特定大厂内部流程。安全、质量、配置和项目管理贯穿阶段，不是只在最后一天补文档。

目标是“演示范围内可解释、可复现、可验收的工程闭环”。真实业务、真实模型、压力性能与新身份发布条件均不因两周截止日期而降低。长期维护与下线排除；需要的运行交接与恢复演练保留。实际公开GitHub发布不是站点按钮的副作用。

## 反思主题

从M06“核验了错误事实源”、M08“未建未知结果状态”、M14“有展示无完整生产者”和当前文档滞后四类实际问题，练习：先写不变量与反例→解释故障机制→写最小修复→用独立事实复核→再更新文档。每次要能自己讲清一个因果链，而非积累AI生成的术语。
