---
id: DOC-BANK-MODELING-20260930
title: 银行与 CLI Agent 的双模型对照及 Vibe Coding 复盘
document_type: reference
domain: architecture
status: reviewed
authority: informative
version: 1.0
effective_date: 2026-09-30
owner: project-owner
---

# 双模型对照：业务含义比目录结构更重要

## 阅读入口与本轮边界

先看 [离线图册](preview.html)，再看本文的差距表，最后做 [练习与 AI 协作模板](practice.md)。[原生 draw.io 图册](business-models.drawio)有八页，可逐个修改；[图模型](views.json)和 [生成器](render.mjs)保留可重建来源。另提供精确到事务阶段的 [转账时序](transfer-sequence.puml)及 [转账状态机](transfer-state.puml)。

基线：2026-09-30 当前工作区；分支 main，HEAD `552b3b8ac517bd5991bff446e72d9f4e87ea9543`；开始整理时 Git 状态有 403 条路径记录。**代码模型包含未提交实现，不能用这个提交号独自重建。**本轮不修改产品代码、不修改任务状态、不运行资金写入、不推进业务日期、不重启或停止服务、不冻结身份、不执行 Agent LIVE。

审查覆盖主业务纵切面：身份→账户→转账→风险→回执，贷款申请→审批→核心提交→还款，运营文档状态机，对账→EOD，以及自然语言→CLI→MCP→Harness→Worker→质量投影。结论来自文档、合同、代码数据流和最小静态反例，不等于所有模块、所有异常路径的零缺陷证明。

## 1. 理想业务模型：从已接受约束出发

“理想”不是另造一个商业银行核心，也不是把所有东西拆成微服务；它是当前演示产品承诺的业务语义完整实现。依据按优先级使用：本轮用户约束与已明确的新决定、根 AGENTS.md、已接受 ADR、当前 OpenAPI、当前任务包；历史状态总结只说明历史。

用户已取消 Agent 的反复人工批准门；因此理想模型保留版本/身份/权限校验，但**不恢复逐次人工批准**。银行的风险复核、贷款 maker/checker 是业务规则，与 Agent 工具批准不是同一件事，不随之删除。

### 1.1 参与者、意图、可观察结果

| 参与者 | 业务意图 | 正确的可观察结果 | 权威来源 |
|---|---|---|---|
| 客户 | 登录、查询自己的账户/流水 | PKCE 会话；只能读取归属自己的核心账户 | Keycloak 身份与持久映射；Fineract 账务 |
| 客户 | 向收款人转账 | 可追踪受理、核验入账或明确待核验；重复请求不重复扣款 | Channel 业务状态＋Fineract 核验 |
| 客户 | 申请贷款、选择方式、查询还款计划 | 申请条件保持到核心；利率单位一致；完整或明确分页的计划 | Channel 申请/审批；Fineract 贷款 |
| 运营 maker/checker | 复核风险、审批贷款/撤销 | 身份分离、版本冲突清楚、合法状态转换 | Channel 事务与审计 |
| 运营人员 | 查交易、对账、日终 | 同一关联链；对账指明比较双方；日终不能重复副作用 | 核心事实＋Channel 检查点 |
| 运营人员 | 发布、归档文档 | DRAFT→PUBLISHED→ARCHIVED；旧版本返回 409 | 文档聚合与版本 |
| 测试使用者 | 自然语言发起真实浏览器测试 | 目标转为可执行步骤，真实观察、执行、核验、产证据 | 真实 BYOK＋Harness＋浏览器 |
| 质量查看者 | 查看运行/失败/发布 | 只读显示真实账本，不创作或改变运行状态 | Harness SQLite＋证据验证器 |

### 1.2 限界上下文与状态所有权

| 上下文 | 聚合/业务概念 | 拥有的状态 | 不拥有的状态 |
|---|---|---|---|
| 身份与客户 | Subject→CoreClient 绑定 | 本地身份映射 | 核心客户账务、浏览器密码 |
| 账户查询 | Account、Balance、Statement | 只读模型 | 余额真相与记账 |
| 收款人 | Beneficiary | 客户收款人及归属 | 目标账户核心余额 |
| 支付 | TransferOrder、Receipt、Reversal | 幂等、状态、版本、关联、Outbox、本地投影 | Fineract 实际分录 |
| 风险 | RiskDecision | 决策、复核、maker/checker | 转账业务以外的任意状态 |
| 贷款工作流 | LoanApplication、Approval、DocumentRef | 申请条件、审批及提交结果关联 | 核心贷款本金/还款事实 |
| 文档 | OperationsDocument | 内容、摘要、版本及生命周期 | 测试授权 |
| 审计/通知 | AuditEntry、Notification | 审计链、客户消息/已读 | 主业务合法性的替代判断 |
| 对账 | ReconciliationRun、Difference | 被比较事实及差异 | 自己生成的“核心事实” |
| 运营编排 | EodRun、StepCheckpoint | 作业顺序、锁、日期绑定、检查点 | 远程作业的天然 exactly-once 保证 |
| 测试平台 | Journey、CaseVersion、Task、Run、Incident、ReleaseEvidence | Harness 执行状态、证据与判定 | 银行交易真相 |

核心领域关系：Subject 绑定 CoreClient；CoreClient 拥有 CoreAccount/CoreLoan；Subject 管理 Beneficiary、LoanApplication；TransferOrder 引用付款/收款账户，并关联 RiskDecision、Receipt、Reversal、OutboxEvent；LoanApplication 关联 Approval 并在提交后引用 CoreLoan。**申请不是贷款，受理不是入账，本地借贷投影不是核心总账。**

数据库共置不等于模块共同拥有所有表。只读投影跨表是合理查询；跨模块写入必须由业务服务明确编排。这里不需要事件总线、微服务或通用 CRUD Repository。

### 1.3 主流程与不变量

**转账：**输入/归属检查→幂等受理→风险决策→提交权短事务→事务外核心请求→核心权威回读→新事务收敛状态/回执/投影/通知/审计。超时、5xx、回读失败表示未知，不表示拒绝；核心确定拒绝与回读为空才可按既有规则失败。无手续费的黄金场景付款减额=收款增额；发生费用必须单独纳入守恒项。

**贷款：**草稿→评分→审批申请→不同 checker 决策→按已批准金额/年利率/客户选择的还款方式提交核心→绑定 CoreLoan→查询/还款/关闭。报价利率、批准利率、核心实际利率是不同字段；任何单位转换只能有一个明确责任人。还款属于资金写入，不能只因为用了核心 API 就跳过 ADR-004 的控制。

**日终：**固定请求日期/身份→取得锁→检查未完成交易→真实来源对账→执行核心作业→确认副作用/检查点→最后推进日期。远程完成与本地检查点之间存在失败窗口，不能由“跳过已完成步骤”推导出作业 exactly-once。

**Agent：**目标/明确业务输入→受约束的模型计划→MCP 控制调用→Harness 版本化执行→Worker 当前页面观察与动作→Playwright/网络/业务核验→Harness 运行证据→只读 Quality。允许确定性工作流控制工具与权限；模型无需直接获得裸写入工具。失败立即停止是当前约束，不要求自动修复或无限重规划。

## 2. 实际实现模型：当前代码做了什么

### 2.1 已形成的正确结构

- 银行入口、Fineract 唯一账务源与五能力端口已经存在；`SecurityConfig.java:100–114` 校验 issuer、audience 和 azp，不能继续沿用旧审计的“只验 issuer”结论。
- `TransferProcessor.java` 使用 TransactionTemplate 分阶段领取提交权、事务外核心调用、回读后本地收敛。`CORE_RESULT_UNKNOWN` 并非一个只写在文档里的状态。
- `RiskService.java:27–40` 保留行锁、版本及 maker/checker；`OperationsDocumentService.java` 的版本条件状态机、内容入库与成功审计同事务，是可复用的好案例。
- EOD 编排已经进入 operations；`EodRepository.LockHandle` 独占连接并在整个协调过程释放锁，SQL 已归 Repository。
- 生产 CLI 环境组装明确 `directExecution: true`；新会话自动驱动决策与执行，不要求逐步人工批准。`journey author` 仍是候选编写入口，不能据此断言自然语言直接运行仍有人审阻塞。
- Worker 有显式 `fuxing-bank-demo` 适配器；Midscene 观察当前页面，受控动作由 Playwright 核验。它是**有真实模型和真实动作的受约束测试 Agent**，同时保留编译脚本/确定性工作流特征，不是任意站点无限自治 Agent。
- Quality 的 cases/runs/schedules/incidents/knowledge 来自 SQLite 查询，只读路由与 loopback 服务已有实现；发布投影仍未闭合。

### 2.2 当前剩余耦合

| 位置 | 实际依赖/责任 | 需要区分的性质 |
|---|---|---|
| TransferController | 身份、收款人、账户核心读取、支付存储、状态机、审计、处理器，以及 SQL WHERE 拼装 | 应用编排与存储查询语法进入 HTTP 层，属于实际边界泄漏 |
| FineractLoanPort | 解析字段、金额、期数；同时决定固定还款方式与最多 24 期 | 技术翻译合理，静默替业务决定不合理 |
| ReconciliationService | 转账核心回读＋本地投影平衡，标记“核心→总账” | 依赖方向不坏，但业务含义/比较来源不成立 |
| EodCoordinator | 对账、核心作业、支付待办、审计、日期推进 | 这是必要应用编排；问题是日期绑定与远程检查点，不是依赖数多本身 |
| CLI production-service | 自动驱动 target/case/compile/activate/run 的多阶段 Harness 协议 | 协议集中可以合理；约千行服务与历史决策名使入口语义/定位成本增加 |
| 通用 Worker / 银行 adapter | 当前动作限定于显式目标配置 | 银行专用适配是合理边界；“任意站点能力”必须另有证据，不能由银行 PASS 推导 |
| QualityReadModel | 状态映射与查询；releaseGate 固定、releases 空实现 | 接口连通不等于功能完成 |

`BankModuleArchitectureTest.java:16–28` 只验证 Controller 不依赖 Controller、Controller/Service 不依赖 JDBC/SQL 类。它不识别 WHERE 字符串、不检查业务单位、不证明跨模块所有权、不证明事务代理生效。**绿灯证明的是规则写了什么，不是规则名字声称了什么。**

## 3. 差距与缺陷清单

分类：**D**=代码数据流直接确认；**B**=已确认设计/合同偏离；**R**=已定位失败窗口，实际影响还需指定测试。P1 优先于 P2；本轮不设置“已修复”或“LIVE 已复现”。定位行号以本轮工作区为准。

| ID / 类别 / 优先级 | 理想→实际 / 证据 | 后果 | 最小修法与验收 |
|---|---|---|---|
| M01 D P1 | `LoanApply.tsx:43` 可选等额本金；`LoanWorkflowService.java:142`→`FineractLoanPort.java:16–17,89–103` 的命令没有方式字段，amortizationType 固定 1 | 用户选择留在本地申请，却没有进入核心贷款 | 将已选方式纳入业务命令，端口映射核心枚举；两个方式各做 HTTP 合同及核心回读，不能只断言本地字段 |
| M02 D P1 | `FineractLoanPort.java:167` 优先取 interestRatePerPeriod；`CustomerController.java:168` 原样输出；`LoanDetail.tsx:29` 标“年利率” | 月利率被显示成年利率；审批 4.35% 年利率的月度输入 0.3625% 会被错标 | 端口输出明确 annualInterestRate，使用核心年利率或按明确频率转换；同响应含两字段时必须显示 4.35，不显示 0.3625 |
| M03 D P2 | 申请允许 1–480 月；`FineractLoanPort.java:153` `.limit(24)`；详情无分页提示 | 长贷款只显示前 24 期，页面看起来像完整计划 | 返回全部已有合同计划，或先明确分页合同；25/36/480 期输入核对期数与最后日期 |
| M04 D P1 | OpenAPI 幂等键只限制长度；`TransferController.java:123` 拼 JSON；`TransferStateRepository.java:14–15` 转 jsonb | 合法含引号的幂等键生成非法 JSON，受理事务失败；这是编码错误，不该加任意字符禁令绕过 | 用现有 ObjectMapper 序列化元数据；含引号、反斜线、换行的合法键做接口集成测试 |
| M05 D P1 | `ReconciliationController.java:14,24`→Service 公共 run；`ReconciliationService.java:36–37` 自调用带事务的 overload `:52–53` | Spring 默认代理无法拦截自调用；手工 run 及 differences 写入可能分次提交 | 核心读取放事务外，结果写入用明确短事务；注入第二个 difference 写失败，验证主记录与差异都回滚 |
| M06 B P1 | `ReconciliationService.java:111–113` 的 CORE_TO_GENERAL_LEDGER 比较 channelToCore＋`ReconciliationRepository.java:37–42` 本地 transfer_accounting_projection | “核心总账对账”实际没有读取核心总账；不能检测仅发生在核心分录层的差异 | 若承诺真实总账对账，就调用已有核心作业端口的日记账能力并按核心交易关联；否则准确更名并取消该发布保证。构造核心 GL 不一致但本地投影一致的反例 |
| M07 D P1 | `EodCoordinator.java:49,59` 使用请求日期执行；`:79–84` 按键读取旧 run 返回旧日期但不校验 | 同键旧日 INTERRUPTED＋新日请求会拿新日锁、沿旧 run 检查点执行新日步骤 | 同键不同日期先返回 409，后续只用注册 run.date；D1 中断后相同键请求 D2，验证零核心调用、零新检查点 |
| M08 B/R P1 | `LoanCoreController.java:40–53` 还款直接核心交易；贷款提交 `LoanWorkflowService.java:126–146` 仅绑定 key 后 POST | 还款缺少 ADR-004 的本地操作状态/请求指纹/Outbox/审计/未知收敛；提交超时后再 POST 依赖外部幂等实际保证 | 分别定义贷款提交和资金还款的操作结果模型，不照抄整个转账模块；在隔离环境模拟核心接受但响应丢失，验证只回读且不会二次扣款。**尚未证明已发生重复记账** |
| M09 B P2 | `TransferController.java:65–74` 事务内核心归属读取；`ReconciliationService.java:45–58,83` EOD 事务内核心回读 | 与 ADR-004 禁止网络持有渠道事务不符；延迟扩大连接/锁占用 | 事务外取受控核心事实，短事务内重验必要本地版本并落结果；用慢核心端点核对 DB 连接/锁占用 |
| M10 B P2 | Controller 拼 WHERE；`TransferRepository.java:53,86` 接收 where/parameters；ArchUnit 只查 SQL 类依赖 | schema/别名/查询语法变化仍需改 HTTP 层；搬 SQL 并未完整解耦 | 使用本业务具名筛选参数；WHERE 留 Repository。保持已有查询结果与分页合同，不加通用查询框架 |
| M11 R P1 | `EodCoordinator.java:59–60` 远程 step 完成后另存 completeStep | 核心成功、本地未记检查点时进程退出，恢复可能重复远程作业 | 按每个作业的真实幂等/回读能力界定恢复，结果未知不可直接再提交；在“远程成功→检查点”间故障注入。**当前不能宣称 exactly-once，也不能断言每个核心作业都会重复记账** |
| M12 B/R P2 | `EodCoordinator.java:102` LOCK_DATE/UNLOCK 是空步骤，待处理数只在 PENDING_CHECK 时读 | advisory lock 只排斥 EOD 协调器，不自动阻止其他新资金请求；“锁日”命名超出实现 | 明确演示系统是否承诺日终写屏障；如承诺，银行写入口与日期状态联动。并发转账与 EOD 做隔离测试，不推进留存环境日期 |
| M13 B P1 | `journey-author.mjs:65–77,91–104` 模型抽取 businessInputs 后立即标 USER_CONFIRMED | 用户确认目标不等于确认模型新增金额/收款人；自动执行扩大错误输入后果 | 保持无逐次人审；区分 USER_EXPLICIT 与 MODEL_DERIVED，金额/目标等约束只来自可检查的输入提取合同；未给必填值返回明确缺项。注入“模型擅改金额”候选应拒绝 |
| M14 D P2 | `quality-read-model.ts:66,212` releaseGate='PENDING'、releases()=[] | 发布页始终空，概览永远不反映真实发布判定 | 从已有发布验证账本投影；无记录显示尚未产生而非伪造 GO。测试有/无发布记录及当前身份过滤 |
| M15 D P2 | `LoanDetail.tsx:25` 提前还款按钮无 onClick/导航/表单 | 页面提供可点击产品动作却没有执行路径 | 接真实还款流程，或准确标记暂不支持；浏览器测试点击并观察真实请求/结果，禁止只验按钮存在 |
| M16 B P2 | `module-boundaries-v1.yaml` 中 Flowise=LEGACY_REQUIRED、payments.allowedDependencies=[]；当前 payments 已依赖身份、收款人、风险与审计，根规则已取消 Flowise 产品依赖 | 新开发者和 AI 得到冲突边界；文档通过不等于实际依赖符合声明 | 依赖清单匹配实际允许关系，删除错误的运行必需语义；按日期阅读能力矩阵里的历史登录/发布结果。不是重新接回 Flowise，也不把治理字段当运行依赖证据 |
| M17 D P1 | `demo.ps1:687,757` 接受 verify 命令，但没有实现分支，最终返回 DEMO_COMMAND_NOT_IMPLEMENTED；能力矩阵对此记录正确 | 最终复现合同中的统一验证入口未完成，不能把 prepare/up/status 当产品验收 | 将 verify 连接当前正式测试集及证据验证器，明确缺项/失败退出；不沿用旧 Full18、不开运行时 Mock、不把未执行 LIVE 标 PASS |

M05 的 Spring 行为依据：[Spring 官方代理语义](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)。M01/M02 的核心字段含义依据：[Fineract 官方贷款 API](https://fineract.apache.org/docs/legacy/)：月度利率与年利率是独立字段，amortizationType=1 是 equal installments。在线资料用于核对语义，不代替本项目真实核心版本的合同回读。

### 3.1 复现前需要排除的误判

- 核心端口返回 opaque corePayload 是当前合同允许的响应透传，不等于业务代码仍全部解析 Map。
- EOD 调用支付、对账、审计是跨聚合应用编排的本职，不应为“减少依赖”拆散一致性责任。
- 角色/金额阈值、显式银行 adapter、失败停止都是现有业务/安全边界，不是需要删除的防御。
- 代码中仍有 approval/proposal 字段不证明有人审阻塞；必须检查生产入口是否自动提交它。
- 有真实模型与执行并不保证意图正确；受控 Agent 的改进重点是目标→动作→业务断言闭合，不是为了名副其实加无限自主重试。

## 4. Vibe Coding 的工程复盘

无法仅凭源码归因“某个 bug 是 AI 写的”，也不能推断你是否读过某份代码。下面是从**已观察实现模式**提出、供你检验自己的习惯假设，而非人格评价。

| 观察到的工程模式 | 可能的 AI 使用习惯 | 更好的替代习惯 | 你要掌握的工程能力 |
|---|---|---|---|
| SQL 类归零但 WHERE 仍在 Controller | 用文件名/规则 PASS 代替责任边界 | 要求解释一次业务变化会改哪些模块，并自己追一条调用链 | 信息隐藏、依赖方向、应用服务 |
| 月率标成年率，选择方式未传核心 | 只核对字段名称/页面可见性 | 为每个业务数值写单位、来源、转换责任与反例 | 领域语言、语义类型、合同映射 |
| 本地投影命名为核心总账对账 | 用“功能名称存在”代替来源独立性 | 先画比较双方和测试 oracle，再写实现 | 账务权威、可证伪测试、覆盖范围 |
| 外部成功后本地检查点才落盘 | 只问 happy path 是否通过 | 在时序图每条持久化/远程箭头间标 crash 点 | 分布式失败语义、幂等、事务 |
| 一千行自动驱动器与历史协议并存 | 每轮追加一个修复分支，不做阶段性收敛 | 每个纵切面结束后审查可删除代码与入口合同 | 演化设计、技术债、状态机 |
| 文档与实际路线不同步 | 让 AI 从多份长文档自己猜权威 | 每次任务提供一页当前合同及明确 superseded 项 | 配置管理、需求追踪 |

最重要的改变：你负责业务判定标准和最小反例；AI 负责展开实现、定位路径、生成图和执行被限定的测试。评审时能解释“为什么正确、哪里仍未知”，比能背出多少设计模式更有价值。

## 5. 本轮交付与验证口径

图册按 architecture-diagrams 的“一图一个问题”组织；draw.io 按原生 XML 保存。这里没有安装新渲染器、加载外部图标、上传源码或读取凭据。SVG/HTML 是本地模型生成的预览，不是实时系统截图；PlantUML 是可编辑时序/状态源，本轮不声称经过 PlantUML 引擎渲染。

复建：在本目录运行 `node render.mjs`；静态反例运行 `node counterexamples.mjs`。该脚本仅检查公开源码/模型与编码反例，不调用银行、模型或数据库。仓库文档门为 `python scripts/docs/validate_docs.py`。结果见 [验证记录](verification.json)。附带 PNG 使用现有 Codex runtime 的 sharp 将同源 SVG 本地渲染；[理想/实际对照预览](comparison.png)是静态模型图，不是实时截图。

后续修复如获授权，仍进入既有 `agent/plans/active/v54-implementation-batches.md` 和 `agent/backlog.yaml`，本报告不是第二份实施顺序。本轮产出使后续修复可针对业务含义验收，不改变当前发布/LIVE 状态。
