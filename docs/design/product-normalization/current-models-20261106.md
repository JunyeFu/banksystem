---
id: A08-CURRENT-MODELS-20261106
title: 当前业务与实现模型收口
document_type: task-package
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# 当前业务与实现模型收口

## 业务目标与已观察差异

RF064-S1仍要求当前专业模型。9月30日图保留了贷款单位缺陷、demo verify未实现、Quality发布为空及旧import关系，不能继续称为当前实现。新图必须从现行需求及源码出发，分开目标、代码、历史LIVE和待验收；不能用图代替正式28项或本人贡献核实。

## 三个小任务

1. M1 核对：按既有N01—N12核角色、状态所有权、两产品组件、转账与Agent逻辑时序、文档版本状态、部署声明和领域关系；重新提取既有11个生产包显式import的DSM。源码锚点只从具名文件读取，不扫描运行态/数据/凭据。旧图不改写，新目录保留理想与实际差异说明。
2. M2 成图：在models-20261106下维护一份具名模型输入和小型生成器，生成可编辑多页drawio及同源SVG/PNG。图种为用例、能力对照、银行/Agent组件、两条关键时序、状态、逻辑领域关系、关键部署及DSM。序列几何复用已安装drawio-skill的seqlayout.py，不手摆；其它每张关系图小于15节点，矩阵和能力表按确定网格生成。图只说已核范围，不把Java包当微服务或逻辑关联当跨库FK。
3. M3 核验与回灌：XML结构、来源锚点与语义边界、SVG自身DOM几何/文字、实际PNG逐张复看；更新系统设计和资料入口，治理/docs通过后本包移交REVIEW。未完成图/来源继续留明示缺项，不提升RF064/A08整体状态。

## 路径与工具边界

白名单：docs/design/product-normalization/{current-models-20261106.md,models-20261106,system-design.md,README.md}、RF064 batch/slices/S1.yaml/tasks/S1.md/evidence-index.md、唯一实施顺序与backlog；必要documents/catalog.yaml只更新源稿入口，不改未验页Word状态。预算38文件/30新增/2200行，0产品API/迁移。只读源码和合同，不做模型/银行/业务日期操作，不提交/推送，不改历史图或个人笔记。

已核draw.io Desktop与Graphviz未安装，技能doctor确认可离线生成XML/IR但不能原生导出。沿项目已有同源图像预览方式，使用已安装技能的序列布局及本地固定Playwright/Chromium渲染SVG，不装工具、不上传模型；SVG/PNG明确是同源预览，不声称原生draw.io导出。保留drawio源文件以便编辑，不按通用技能示例删除源码。没有可见窗口或新端口。

## 验证与完成门

STATIC：来源文件/锚点存在、状态/关系与当前源码逐项对照；技能validate.py检查原生XML，生成器/实际渲染校验每张图的节点、边、文字和无截断。语义审查必须指出已确认源码差异及剩余耦合，自动import图不证明运行死锁/递归或所有依赖均合法。CONTRACT/INTEGRATION/LIVE_E2E：本包不新增或执行产品测试，引用已有对应证据时保留对象/日期。最新841项源码门、旧身份S5、正式28项未完成及安全NO_GO继续区分。图册入口可读、源可编辑、实际图可见且证据回灌后才移交；最终候选/28项/容量/远端CI和文书验页门不因出图关闭。

## 实施与验收导向复审回执

### M4：已观察依赖的最小声明修正

当前只读逐行确认实际import来自LoanOperationService.java:12，其在完成操作的短事务内写LOAN_OPERATION_COMPLETED审计；LoanWorkflowService未直接import AuditService，首轮图册说明同时列它并不精确，本轮纠正。该调用属于既有资金审计要求，不删除或另造抽象。精确白名单追加module-boundaries-v1.yaml中bank.customer-profile.allowedDependencies，只新增bank.audit；原API、数据所有权、模块状态与其它允许边不改，不打开业务源码模块。

完成门：原65文件/14条显式边及实际审计调用保留，DSM未登记边由1降至0；现有治理3项及RF064/docs通过，当前编辑源/DSM预览按原工具刷新，不改布局/旧9月图。M4预算12文件/0新增/100行（生成物除外），原任务状态只在backlog；不启动Java/模型/银行或把架构图校验写成运行通过。

M4实际出口：仅在bank.customer-profile增加bank.audit，其它模块声明/公开接口/数据所有权及Java不改。现有治理单测3/3、RF064校验通过；原生成器重新读65文件/14条import，未登记0/强连通组0。独立消费JSON核LoanOperationService唯一审计import及LOAN_OPERATION_COMPLETED仍存在，未用删除调用求零。首轮README误列LoanWorkflowService亦已纠正；首次发现一条缺项的历史段落保留。

现有drawio生成/结构流程只更新DSM声明一格与汇总文本，不换工具或布局；十页结构0错误/0警告，固定本地浏览器DOM/十图加载检查通过，刷新DSM实际PNG已实看。Java架构测试不读取此YAML，故未将其冒充本次声明消费者或重跑无关Java套件。设计及当前图册同步0未登记，不把同范围声明一致写为全仓无耦合。本增量移交REVIEW；原服务/数据/笔记、未验页文书及整体NO_GO保持。

### 首轮图册回执（声明修正前）

已交付[十视图图册](models-20261106/README.md)、多页drawio、十张SVG及十张实际PNG，输入与生成器同目录可读。19个具名源码/需求锚点实际匹配；序列复用已安装技能seqlayout，预览直接消费生成XML的几何，不手写第二套时序位置。工具doctor只读确认无Desktop/Graphviz；未因此安装工具、启动可见窗口/服务或上传模型。

复审对照当前TransferProcessor、状态矩阵、贷款端口、真实GL关联、EOD作业回读、共享会话/轮次绑定、统一发布验证与Quality投影。纠正旧图中已修源码仍作当前缺陷的描述；状态图明确UNKNOWN→FAILED仅为矩阵允许，并不暗示处理器见不到结果即失败。两条时序为应用逻辑节选，不谎称精确HTTP抓包或每种分支均已LIVE。

重新抽取65个Java文件、14条唯一跨包显式import、0强连通组、1条未声明：customerprofile→audit。JSON保存每条路径/行号，未修改注册表或删除必要审计调用以美化矩阵；该声明缺项作为后续控制修正。空白矩阵不证明完全无耦合，逻辑领域图不冒充物理ER；部署图明确是关键声明视图，不是原15容器实时盘点。

实际检查：原生十页由validate.py逐页检查，0错误/0警告；评分0仅属该检查器，不是所有几何/语义的充分证明。固定Playwright1.59.1/Chromium147读取实际SVG DOM，十图非空、边数量与模型匹配、仅预期直线段、边标签不互叠、文字不越画布；图册十图加载与编辑源入口通过，外部请求0/页面错误0。十PNG已逐张实看，两轮定向修正只处理角色/序列标题折行和状态交叉线，最终角色图再次实看。不使用原生Desktop导出措辞，不生成新HTML报告或重复全量源码快照；index.html是图册本身。

RF064治理与docs通过，设计源稿/总览回灌当前图入口，旧9月图不覆盖。system-design新增图入口后，先前未验页Word仍仅是旧草稿，不声称它已包含新图或已交付；文书包需待渲染条件闭合再按当前源再生验页。原银行/Agent/站点保留，不读写原账务状态或个人笔记，无真实模型/正式28项、身份冻结、Git提交/推送。本包移交REVIEW；RF064/A08与整体NO_GO不因模型完成而提升。
