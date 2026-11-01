---
id: DOC-ARCH-BUSINESS-MODULE-DEFECT-AUDIT-V1
title: 业务模块缺陷、耦合与整体重构审计 v1
document_type: architecture-audit
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# 业务模块缺陷、耦合与整体重构审计 v1

审计日期：2026-09-22  
源码基线：`main@552b3b8ac517bd5991bff446e72d9f4e87ea9543`  
审计对象：当前工作区源码、合同、Compose、CI 与现行计划；工作区已有 189 项改动，本审计不把静态观察写成 LIVE 或发布通过。  
状态词：`CONFIRMED` 表示源码直接证实；`INFERRED` 表示由多个直接事实推导，实施前需用针对性测试确认；`EVIDENCE_GAP` 表示当前缺运行证据。

## 1. 结论

项目已经形成可演示的银行前台、运营台、账务适配、CLI Agent、Harness、MCP、Worker 和质量门户，但当前结构仍是“按迭代阶段累加能力”，不是围绕稳定业务边界组织的产品结构。三轮审计共登记 70 项问题：首轮 33 项架构与交付问题，第二轮 27 项业务真实性与状态一致性问题，最终轮 10 项运行权威与完整产品闭环问题。最主要的系统性问题有六个：

1. 银行渠道层把 HTTP、业务流程、SQL、Fineract 调用、审计和测试支撑混在控制器或少数大类中；一次改动经常跨接口、表、核心账务和测试数据。
2. Agent 链路存在三个业务编排中心：CLI `production-service`、MCP `server`、Harness `service/I10Service`；同一个 Journey 的解析、状态、批准、执行和错误语义分散。
3. 历史阶段 I2—I10、Flowise 与当前 CLI 产品同时留在源码、迁移、CI 和权威计划中，形成显著的时间维度耦合。
4. 正式验收驱动本身掩盖底层错误、占有服务生命周期且不能可靠恢复中断检查点，使测试基础设施反过来阻碍缺陷定位。
5. 转账、冲正和日终都把 Fineract 远程副作用与本地数据库事务混成一个原子动作；网络结果不明、进程崩溃或本地提交失败时没有可收敛的中间状态。
6. Harness 的 `VERIFIED` 只证明工件种类、绑定和哈希，没有证明浏览器断言、业务关联号与 Fineract 交易一致；Quality Portal 也没有投影当前身份的发布事实。

推荐目标不是立即拆微服务，而是先收敛为两个边界清晰的模块化单体：`bank-channel` 与 `test-agent`。Fineract 继续是账务真相源，Harness SQLite 继续是测试状态真相源；通过应用服务、端口和仓储把边界变成代码事实，再决定是否有模块值得独立部署。

## 2. 当前耦合图

```text
Customer / Operations Portal
        │  duplicated auth + partial local fetch wrappers
        ▼
Gateway ───────────────► internal/test-support and mock routes
        ▼
Bank controllers ──────► JdbcTemplate ─────► shared channel schema
   │      │                                      ▲
   │      └── controller-to-controller           │ reset knows 19 tables
   ▼                                             │
FineractAdapter ───────► Fineract           TestSupportController
   ▲
TransferProcessor: local transaction + remote core call + projection writes

hz-agent CLI production-service
        ▼
MCP server: 33-tool registry + validation + mapping + projection
        ▼
HarnessService (4387) ──► I10Service (3468) ──► one SQLite / 40 migrations
        │
        ├── Worker / Playwright / Midscene
        └── Quality API + static portal hosting
```

耦合的共同模式是：入口层知道了持久化结构，编排层知道了传输细节，历史阶段名进入了现行业务模型，测试工具知道了产品内部实现。

## 3. 全量问题登记

“全量”指本次所检查源码与配置中的全部已观察问题，不表示未经运行覆盖的代码不存在其他缺陷。

### P0：先处理，否则继续 LIVE 会重复消耗时间或产生账务歧义

| ID | 状态 | 问题与证据 | 影响 | 目标状态 |
|---|---|---|---|---|
| BIZ-P0-01 | CONFIRMED | `TransferProcessor.process()` 在本地 `@Transactional` 中先调用远程 `FineractAdapter.accountTransfer()`，成功后再更新 `transfer_order`、写 `ledger_entry`、回执、通知和审计。 | Fineract 成功而本地事务失败时形成跨系统不一致；虽向 Fineract 传了幂等键，但本地恢复语义仍未被一个显式流程建模。 | 建立 `TransferApplicationService`，使用持久化 transfer 状态驱动“核心提交→核心回读→本地投影”，重入只按同一幂等键回读/收敛，不把网络调用包进数据库事务。 |
| BIZ-P0-02 | CONFIRMED | Fineract 被定义为唯一账务真相源，但渠道库仍把两条借贷投影命名为 `ledger_entry`，测试断言也称 `ledgerBalanced`。 | 容易把渠道投影误认为第二套总账，并以本地平衡替代 Fineract 入账事实。 | 重命名概念为 `transfer_accounting_projection`；正式成功必须绑定 Fineract transaction/resource id 与核心回读结果。 |
| BIZ-P0-03 | CONFIRMED | `mock-clearing-service` 在默认 Compose 中构建并启动，Gateway 同时暴露 `/internal/mock-clearing/**`；渠道内还有 `MockClearingService`。 | 两套 Mock 清算责任重复，且与“演示/正式产品链路不含运行时 Mock”基线冲突。 | 从默认拓扑移除外部 Mock；需要受控失败时仅由测试 profile 显式启动一个模拟器，正式黄金链不经过它。 |
| AGT-P0-01 | CONFIRMED | `naturalLanguageBootstrapInput()` 用正则要求用户文本中出现 URL、`目标系统:`、`credential_<uuid>` 等技术字段。 | CLI 表面是自然语言 Agent，实际把内部装配责任泄漏给用户，并造成 `JOURNEY_ENTRY_URL_INVALID`、`JOURNEY_TARGET_SYSTEM_INVALID` 等确定性失败。 | 用户只给业务目标；CLI 从已选 application profile 和本地凭据绑定填充 entry URL、target system、credential ref。 |
| AGT-P0-02 | CONFIRMED | Full18 `classifyInvocation()` 把非批准类 CLI 失败统一映射为 `AGENT_FULL18_CHAIN_EXECUTION_FAILED`。 | 第一根因被外层错误吞掉，必须人工逐层复跑才能找到真实 message code。 | 原样保留结构化 `messageCode/category/details`，Full18 只增加 case/variant 上下文，不改写根因码。 |
| AGT-P0-03 | CONFIRMED | L1/Full18 先写 `RUNNING`，中断后再次 `run` 只返回 `CHECKPOINT_REQUIRES_DECISION`；`RUNNING` 没有自动对账到 Harness 终态的恢复路径。 | 进程中断会把同一身份卡死，既不能安全续跑，也不能明确判失败。 | 增加 `reconcile`：只读取 Harness Journey/Run 事实，将 checkpoint 收敛到 PASSED/FAILED/RESUMABLE；未知状态才停止。 |
| AGT-P0-04 | CONFIRMED | L1 validator 会停止自己启动的服务，是否保留依赖 `HENGZHUN_KEEP_MANAGED_SERVICES=1`；运行器同时探测并管理已有服务。 | 验收脚本意外成为环境所有者，违背“服务保持全开”，并放大启动/健康竞争。 | 生命周期返回每个服务的 `PREEXISTING/STARTED_BY_RUN` 所有权；默认不停止，显式 `--ephemeral` 才清理本次启动项。 |

### P1：模块边界失真，继续加业务会放大修改半径

| ID | 状态 | 问题与证据 | 影响 | 目标状态 |
|---|---|---|---|---|
| BANK-P1-01 | CONFIRMED | 28 个 Java 文件直接使用 `JdbcTemplate`，大量 Controller 直接拼 SQL。 | HTTP、业务规则、表结构、事务无法独立变化；单元测试只能靠数据库。 | Controller 只做协议映射；应用服务组织用例；模块 Repository 独占 SQL。 |
| BANK-P1-02 | CONFIRMED | `notifications.StatementController` 直接注入 `identity.CustomerController`。 | 控制器成为另一个模块的内部 API，绕过稳定业务接口。 | 提取 `CustomerIdentityQuery` 应用端口，两个 Controller 都依赖该端口。 |
| BANK-P1-03 | CONFIRMED | 边界文件声明 `payments.allowedDependencies: []`，实际 payments 直接依赖 audit 与 reconciliation；documents 依赖 audit。 | 架构登记与源码相反，无法作为约束。 | 先登记真实依赖，再通过领域事件/应用端口消除反向依赖，最后以 ArchUnit 固化。 |
| BANK-P1-04 | CONFIRMED | `FineractAdapter` 358 行，同时承担客户、账户、贷款、作业、转账、搜索，并混用 Spring client 与 `HttpURLConnection`。 | 任一 Fineract API 变化影响全部业务；认证、错误语义和传输策略重复。 | 按能力拆为 `CustomerCorePort`、`AccountCorePort`、`TransferCorePort`、`LoanCorePort`，共享一个受控 HTTP transport。 |
| BANK-P1-05 | CONFIRMED | `TestSupportController` 664 行，直接删除 19 张业务表、写身份映射、播种 Fineract、查询断言并管理业务日期。 | 测试支撑与全部模块和表结构强耦合，新表即可破坏 reset；它已成为旁路业务应用。 | 独立 `test-fixture` application service；每个模块贡献 fixture/reset port，不允许总控写模块表。 |
| BANK-P1-06 | CONFIRMED | baseline fixtures 同时存在根合同与 service resources 两份；加载失败后尝试相对 classpath，并以宽泛 `catch` 返回 null。 | 数据合同可漂移，真正的解析/打包错误被伪装成“无 fixture”。 | 根合同为唯一文件；构建时复制或打包；解析失败带确定性错误直接终止。 |
| BANK-P1-07 | CONFIRMED | `SecurityConfig` 用一个硬编码 matcher 矩阵掌握所有模块路径和角色。 | 每个模块新增接口都修改全局安全热点，遗漏顺序即可改变权限。 | 各模块导出自己的 `AuthorizationRules`，总配置只组合，不重新描述全部业务。 |
| BANK-P1-08 | CONFIRMED | 仓库同时跟踪 `services/bank-channel`（34 文件）与现用 `services/bank-channel-service`（75 文件），两者 artifactId 均为 `bank-channel-service`。 | 开发者可能修错目录；扫描、许可证、依赖和搜索结果重复。 | 验证无运行引用后删除旧目录；历史只留 Git 历史，不保留第二份源码。 |
| BANK-P1-09 | CONFIRMED | Gateway 把 test-support、mock-clearing、internal transfer、EOD、reconciliation 与 customer API 放在同一代理入口。 | 内部测试/运维接口扩大到前端可达面，边界依赖角色配置而不是网络/入口分区。 | public gateway 仅开放 customer/operations API；test-support 仅 loopback/test network 独立 listener。 |
| AGT-P1-01 | CONFIRMED | `HarnessService` 4387 行并组合 `I10Service` 3468 行，两者共同访问同一 Database。 | Journey、case、authoring、execution、schedule、repair、evidence 的所有改动汇聚到两个大类。 | 按业务能力拆应用服务和 repository；共享事务门面而不是共享任意 SQL。 |
| AGT-P1-02 | CONFIRMED | MCP `server.cjs` 1287 行注册约 33 个工具，同时做 schema、映射、调用和输出投影。 | MCP 不再是薄适配层，工具变更难以局部验证。 | 每个能力组一个 tool module；注册器只组合，业务错误由 Harness 原样返回。 |
| AGT-P1-03 | CONFIRMED | CLI `production-service.mjs` 1067 行同时处理输入解析、session、proposal、模型作者化、MCP 编排、执行轮询和证据投影。 | CLI shell、Agent 决策与执行工作流无法独立演进。 | 拆为 `GoalIntake`、`JourneyWorkflow`、`SessionStore`、`EvidenceQuery` 四个应用组件。 |
| AGT-P1-04 | CONFIRMED | Harness 40 个顺序迁移混合 I2/I3/I4/I5/I6/I8/I9/I10；存在 generic 与 i8 failure/repair 两套表，个别表在后续迁移重建。 | 当前领域模型被历史阶段命名支配，同一概念有多套生命周期。 | 先建立现行逻辑 schema 映射，再做一次离线压缩迁移；运行代码不再出现迭代代号。 |
| AGT-P1-05 | CONFIRMED | `server.ts` 1083 行同时承担 HTTP 鉴权、业务路由、Quality API、静态文件和 Harness 服务启动。 | transport 与产品读模型/资产托管绑定，路由改动影响运行核心。 | 切成 router modules；Quality 仍同进程同端口，但只作为独立 read-only router。 |

### P2：交付与前端重复，持续制造漂移

| ID | 状态 | 问题与证据 | 影响 | 目标状态 |
|---|---|---|---|---|
| FE-P2-01 | CONFIRMED | customer 与 operations 各自实现 OIDC/PKCE；两边在生成 client 外又有本地 `fetch` wrapper。 | token、错误映射、base URL 与请求头行为漂移。 | 提取 `bank-web-runtime`，只共享认证/session/transport；业务 API 仍由生成 client 提供。 |
| FE-P2-02 | CONFIRMED | `apps/customer-web`、`apps/operations-web`、`apps/operations-console/legacy` 与现用门户并存。 | 页面搜索、依赖扫描和维护对象不唯一。 | 确认 Compose 未引用后删除旧应用源码，保留截图或 Git 历史即可。 |
| OPS-P2-01 | CONFIRMED | `demo.ps1` 739 行，承担准备、构建、启动、状态、黄金链、验证和停止。 | 一个脚本掌握所有产品知识，修改任何模块都可能触及它。 | 根脚本只做命令分派；bank、agent、verify 各有一个生命周期模块。 |
| OPS-P2-02 | CONFIRMED | 可执行脚本 `verify-demo-clean-clone.ps1`、backup scripts 仍包含 `D:\Agent\...` 默认绝对路径。 | 新克隆不具备路径独立性。 | 使用仓库根推导与调用方显式 backup root；示例文档可保留路径，运行代码不可依赖。 |
| CI-P2-01 | CONFIRMED | CI 只在 regression-system 路径触发，只跑 Windows Node 工作流，并安装/审计 Flowise。 | 银行 Java、三个前端、Compose 黄金链不受 CI；已退出产品的 Flowise 仍是 CI 必需品。 | 分 bank/web/agent/compose 四 job；删除 Flowise 安装与 gate；路径过滤覆盖产品全部目录。 |
| GOV-P2-01 | CONFIRMED | 当前产品基线明确 Flowise 仅历史，但 current dependency map、CI 与唯一实施顺序文件的大段现行文字仍把 Flowise 作为控制面。 | 新开发者无法判断哪个架构有效，修复容易回到旧链路。 | 权威文件开头只保留当前架构与当前任务；历史全文移入 archive，链接而不混排。 |
| GOV-P2-02 | CONFIRMED | Flowise 源树、锁文件、SBOM/manifest 引用仍位于 regression product，尽管 ReleaseIdentity 显式排除其 runtime。 | 构建、审计、发布包和开源说明持续承担无产品消费者的历史资产。 | 把历史运行树移出产品包或 Git LFS/release archive；正式依赖图中为零。 |
| GOV-P2-03 | CONFIRMED | current-state 文档仍把依赖度量标记为 `NOT_MEASURED`，但源码已有可枚举的跨包依赖且边界表与事实冲突。 | 架构门禁是人工声明，不是可执行约束。 | 生成一次真实依赖基线，随后只对禁止方向设 ArchUnit/ESLint boundary 测试。 |

### P3：可维护性债务，随主线顺手收敛

| ID | 状态 | 问题与证据 | 影响 | 目标状态 |
|---|---|---|---|---|
| MAINT-P3-01 | CONFIRMED | 关键 Java/TS/JS 源中存在多处宽泛 `catch (Exception/RuntimeException)`，部分返回 null、空集合或通用失败。 | 错误分类在边界间丢失。 | 只在 transport/application boundary 转换一次；内部让确定性领域错误传播。 |
| MAINT-P3-02 | INFERRED | 多个 Controller 同时返回裸 `Map<String,Object>`，Fineract 也以裸 Map 穿透到业务层。 | 字段漂移只能运行时发现，核心 reference/status 语义不明确。 | 在模块边界使用最小 record/DTO；不为内部简单数据额外建抽象层。 |
| MAINT-P3-03 | CONFIRMED | Quality 前端文案仍描述人工批准基线和下载鉴权，而现行目标是只读投影；实际 API 需以当前代码为准。 | 产品叙事与实际操作边界可能不一致。 | 页面只表达当前可观察事实；删除不能执行的控制动作和过时说明。 |
| MAINT-P3-04 | EVIDENCE_GAP | 本次只做静态架构审计，当前 ReleaseIdentity 的 Full18、冷启动、故障恢复与发布裁决没有由本审计重新运行。 | 不能由结构分析推导“产品已上线”。 | 重构每批做最小合同/集成验证；全部收敛后冻结新身份并从 Full18 起点执行。 |

### 第二轮纵深增量：业务真实性、状态闭环与证据语义

以下 27 项不是对首轮“大类过宽”的重复计数，而是沿真实业务路径逐段核对后发现的独立失败点。它们说明当前问题不止是类太大，而是若干页面状态、数据库状态、核心账务状态和发布结论彼此不能相互证明。

#### P0：会产生账务歧义、错误发布结论或阻断无人值守正式执行

| ID | 状态 | 问题与直接证据 | 可复现影响 | 最小修复门 |
|---|---|---|---|---|
| DEEP-P0-01 | CONFIRMED | `TransferProcessor` 捕获所有 `RuntimeException` 并把 `PENDING_CLEARING` 直接转成 `FAILED`；Fineract 的超时、断连和响应丢失也走同一路径。 | 请求已经被核心接受但响应丢失时，渠道宣称失败，客户可能再次转账；这是 BIZ-P0-01 的确定性错误分支。 | transport 明确区分核心拒绝与结果未知；未知进入 `CORE_RESULT_UNKNOWN`，只允许按原幂等键回读后收敛，禁止直接失败或重新扣款。 |
| DEEP-P0-02 | CONFIRMED | `TransferController` 仅以客户端提供的 `scope_key` 查询和唯一约束幂等记录，没有 subject、操作类型或租户；命中后会直接返回原响应。 | 不同客户或不同业务入口复用同一键会相互冲突，甚至把他人的 transfer id/status 回给当前调用者。 | 幂等主键改为 `subject + operation + key`；既有记录返回前必须与当前主体和请求摘要一致。 |
| DEEP-P0-03 | CONFIRMED | `EodController.runPublic/runInternal` 用本地 `@Transactional` 包裹多次 Fineract COB/费用/利息作业和业务日期推进；公开请求在全部远程动作结束后才给 `eod_run` 补写幂等键。 | 本地回滚不能撤销远程作业；进程在远程成功、本地登记前崩溃时，同一请求会再次执行日终。 | 先持久化带幂等键的 EOD run 与步骤状态，再逐步执行/回读每个核心作业；本地短事务不包远程副作用。 |
| DEEP-P0-04 | CONFIRMED | `CHANNEL_TO_CORE` 只数 `SETTLED` 且缺 `core_reference` 的记录；`CORE_TO_GENERAL_LEDGER` 只比较全部 journal debit/credit 总额，没有逐 transfer/reference/amount 回读。 | 任意两笔相反差错可相互抵消，伪造或错误的 core reference 也会得到 `MATCHED`；EOD 随后仍可推进业务日期。 | 对正式日期窗口逐笔核对 transfer、核心 transaction id、账户、金额、币种与状态；存在未解释差异时禁止 advance date。 |
| DEEP-P0-05 | CONFIRMED | Worker 的 `LEDGER` 是 `hengzhun-execution-evidence-ledger/v1` 工件清单；`verifyJourneyEvidence()` 只检查 Run/Task 状态、身份绑定、工件哈希及 DOM/SCREENSHOT/TRACE/NETWORK/LEDGER 五种 kind 是否存在。 | `VERIFIED` 不代表网络断言成立、页面金额正确、correlation id 连续或 Fineract 已入账，发布证据可能对失败业务给出通过。 | 为五类工件定义并校验内容合同；银行 Journey 必须从 NETWORK/DOM 中提取业务断言，并绑定 correlation id、核心交易 id 与只读核心回读。 |
| DEEP-P0-06 | CONFIRMED | 生产 CLI 虽设置 `directExecution: true`，但合同、TUI、L1/Full18 和 release-decision 仍保留 `APPROVAL_REQUIRED`、approve/reject、`ELIGIBLE_FOR_HUMAN_DECISION` 与 `GO:<identity>`。 | 与“全部取消人工批准门、Agent 直接测试”的现行决定冲突；无人值守链路仍可能停在旧审批或人工发布门。 | 删除运行与发布路径中的人工批准状态/命令/退出码；验证器在完整机器证据满足时直接产生 GO，否则产生 NO-GO。 |
| DEEP-P0-07 | CONFIRMED | `SecurityConfig` 的两个 `NimbusJwtDecoder` 只安装 issuer 默认校验器，没有 audience/authorized-party 校验。 | 同 realm 内签发给其他客户端、但带相同 realm role 的 access token 也可能被银行 API 接受，资源服务器边界没有绑定本产品 client。 | customer/internal 分别校验固定 audience 或 authorized party，并用错误 audience 的真实 JWT 集成测试证明拒绝。 |

#### P1：业务状态机或产品读模型与实际行为不一致

| ID | 状态 | 问题与直接证据 | 可复现影响 | 最小修复门 |
|---|---|---|---|---|
| DEEP-P1-01 | CONFIRMED | `TransferStateMachineTest` 明确断言 `SETTLED -> RETURNED` 不允许；`MockClearingService` 的 `RETURN_AFTER_SETTLEMENT` 第二次交付却恰好执行该转换。 | 已声明且被测试清单列出的场景会确定性返回 409；单元矩阵绿但组合链路必失败。 | 先定义 return 的领域语义，再让状态机、模拟器和组合测试使用同一转换；新增该场景的服务级集成测试。 |
| DEEP-P1-02 | CONFIRMED | `RiskService.evaluate()` 只由独立运营接口调用；`TransferProcessor` 从 `VALIDATING` 自动跨过 `PENDING_APPROVAL` 进入核心提交，从未调用风险能力。 | 大额或命中规则的转账仍会直接入账，`RISK_REVIEW` 只是可展示但不约束资金动作的旁路状态。 | 把风险决策置于 transfer application flow 的核心提交之前；需要复核时停止在 `RISK_REVIEW`，明确放行后才继续。 |
| DEEP-P1-03 | CONFIRMED | `TransferReversalController` 的 request/approve/reject 没有事务边界，却执行 `FOR UPDATE`；approve 先调用 Fineract 冲正，再分别更新 reversal 和 transfer。 | 行锁不能覆盖检查到更新；并发 checker 可重复操作，核心成功后本地失败还会形成冲正事实分裂。 | maker/checker 状态更新使用短事务与版本条件；核心冲正采用持久化 pending/unknown/confirmed 流程并按原 reversal key 回读收敛。 |
| DEEP-P1-04 | CONFIRMED | `OutboxPublisher` 不声明 claim/lock 就批量读取全部 `PENDING`；JMS 成功后才更新数据库；达到最大失败次数后把原事件标成 `PUBLISHED`。 | 多实例可重复发布，提交窗口也会重复；进入死信的事件在原表中被伪装成已发布，监控和补偿无法区分。 | 原子 claim 一批事件；消费者按 event id 去重；死信使用 `DEAD_LETTERED`，绝不写 `PUBLISHED`。 |
| DEEP-P1-05 | CONFIRMED | `AuditService` 先查最后 hash 再插入且无串行化；hash 输入不含 before/after、request/correlation、resource type、actor type、时间；取最后 hash 或 JSON 序列化失败时静默改为 null/`{}`。 | 并发事件可形成分叉；关键审计字段被修改仍可通过链校验，序列化失败还会生成看似有效的空内容。 | 在数据库内串行追加；hash 覆盖完整规范化记录；序列化和前序读取失败立即拒绝写入，并补并发与篡改测试。 |
| DEEP-P1-06 | CONFIRMED | `CustomerController.decimal()` 对金额调用 `abs()`，解析失败返回 `0.00`；缺时间返回 1970；非 withdrawal 类型一律映射 CREDIT。 | 负数、未知值和缺失数据被伪装成合法银行事实，客户页面可能展示方向、金额或时间错误的交易。 | 依据 Fineract 明确字段做有符号映射；无法映射就返回确定性数据错误，不生成 0 元或 1970 交易。 |
| DEEP-P1-07 | CONFIRMED | 对账单用“第一个非零 running balance”推导 closing balance，并把所有非 credit 交易都算 debit。 | 真实余额恰为零、顺序变化或存在非借贷类型时，会选取错误 closing balance，随后仍显示平衡。 | 直接使用核心声明的 opening/closing balance 或按固定排序和明确类型逐笔重放，并与核心余额核对。 |
| DEEP-P1-08 | CONFIRMED | `ProblemHandler.coreFailure()` 将最多 2000 字符 Fineract 原始响应放进公开问题详情的 `coreResponse`。 | 核心内部字段、校验细节或客户信息可能直接泄露到浏览器；同时把底层协议绑定到公共错误合同。 | 公共响应只给稳定错误码和 correlation id；原始核心响应仅进入受控服务日志。 |
| DEEP-P1-09 | CONFIRMED | `/api/operations/v1/savings/{accountId}/command/{command}` 把任意 path command 和 body 直接转发给 Fineract，没有命令白名单或逐命令 DTO。 | 一个通用接口绕过了账户生命周期业务边界，调用者可触发未在产品合同中声明的核心命令。 | 删除任意命令转发，为确有需求的 activate/close/lock 等动作建立独立接口、角色与请求合同。 |
| DEEP-P1-10 | CONFIRMED | 客户 core-submit 路由在 `SecurityConfig` 被 `denyAll()`；贷款审批只更新 `loan_approval`，不推进 `loan_application`；core submit 又接受 SUBMITTED 或 APPROVED；评分可无条件改状态。 | 贷款流程既不可从客户链路走通，又无法由批准事实约束核心提交；绕开批准或永久停滞都可能发生。 | 冻结唯一贷款状态机与角色入口：申请提交、评分、maker/checker 批准、核心提交逐步推进，所有入口共享同一条件更新。 |
| DEEP-P1-11 | CONFIRMED | Customer Portal 创建的是 DRAFT，却提示“申请已提交/已受理”；还款方式和备注只在前端展示未发送，利率硬编码 4.35%，返回列表却只读 Fineract。 | 用户看到的提交结果、利率和后续列表都不能证明真实申请状态；本地草稿返回页面后可能消失。 | 页面按 API 返回状态显示；提交所有已展示字段或删掉它们；利率来自产品/报价；列表合并同一贷款流程的本地与核心状态。 |
| DEEP-P1-12 | CONFIRMED | `QualityReadModel.overview()` 把 Harness 健康和延迟写死、release gate 永远为 PENDING，并跨全部身份汇总 7 日通过率；`releases()` 永远返回空数组，certificate 又被映射成 APPROVED baseline。 | 质量门户无法回答“当前 ReleaseIdentity 是否可发布”，还会把自动稳定性证书描述成人工批准基线。 | 所有指标以当前身份过滤；健康来自真实探测；release 列表和 gate 来自验证器只读结果；证书使用其真实语义。 |
| DEEP-P1-13 | CONFIRMED | CLI 没有计划要求的 `release verify`；author 仍要求 entry URL/target/credential；版本仍是 `0.2.0-offline-candidate`，直接执行和旧审批路径并存。 | 公共 CLI 合同与当前产品定义不一致，脚本和用户不能依赖单一行为。 | 收敛一套命令与一条直接执行路径，补 `release verify`，由 application profile 提供内部装配信息并更新产品版本。 |
| DEEP-P1-14 | CONFIRMED | `ReconciliationLogicTest`、`IdempotencyTest`、`AuditHashChainTest` 在测试内重写 SQL/算法或断言常量，没有调用生产服务；状态机测试也未覆盖 mock clearing 的组合调用。 | 这些测试可在生产代码已出现上述矛盾时继续绿色，制造对关键资金与审计逻辑的错误信心。 | 用服务级特征测试替代自实现测试：真实调用生产组件和数据库，至少覆盖跨主体幂等、结果未知、return、EOD 差异与审计并发。 |
| DEEP-P1-15 | CONFIRMED | `LoanDocumentController` 接受客户端任意 `storageRef` 后只插入元数据并返回 `RECEIVED`，没有上传、读取或验证对应文件。 | 贷款页面可把不存在或不属于该申请人的对象宣称为已收件，审批材料状态没有事实来源。 | 文档由服务接收实际内容或只接受服务签发的对象引用；写入前验证对象存在、所有权和申请关联。 |
| DEEP-P1-16 | CONFIRMED | 运营仪表板的“今日交易金额/数量”统计所有当天创建的 transfer，包括失败和处理中；成功率用创建总数作分母，`NOT_RUN` 对账也不会让系统健康降级。 | 运营台会把未入账金额当成交量，并在从未对账时显示 HEALTHY，业务 KPI 与账务事实不一致。 | 明确“受理/成功/失败”三组指标；成功金额只统计核心确认成功；未执行或过期对账必须显示 UNKNOWN/DEGRADED。 |
| DEEP-P1-17 | CONFIRMED | 收款人以账户号的无密钥 SHA-256 作为 `account_token`，同一账户在所有主体下得到同一值。 | 数据库读取者可通过可枚举账户号离线反查并关联多个客户的共同收款账户。 | 使用服务端 HMAC token 做去重，密钥不进数据库；展示仅保留后四位，核心账户 id 由受控映射持有。 |
| DEEP-P1-18 | CONFIRMED | 运营文档状态接口允许 DRAFT/PUBLISHED/ARCHIVED 之间任意跳转，更新不带当前 version 条件。 | 已归档文档可直接重新发布，并发操作会静默覆盖，页面中的版本号不能提供实际并发语义。 | 固定状态转换并在 `WHERE document_id=? AND version=?` 条件更新；冲突返回明确版本错误。 |

#### P2：演示文案把模拟或固定值表达成真实银行能力

| ID | 状态 | 问题与直接证据 | 影响 | 最小修复门 |
|---|---|---|---|---|
| DEEP-P2-01 | CONFIRMED | 转账页把普通网页确认步骤写成“持久化 U盾验证”，没有硬件 U-key、PIN/OTP 或原生签名交互；手续费固定显示 `0.00`。 | 演示会把页面确认误解成真实强认证，把未报价费用误解成银行事实。 | 在实现真实能力前改称“转账确认”，费用只显示后端报价；若无报价则不声称为 0。 |
| DEEP-P2-02 | CONFIRMED | 外部服务探测把任意 `<500` 响应都标为 `AVAILABLE`，因此 401、403 和 404 也算健康；launch URL 又与实际 health URL 分开硬编码。 | 运营台可能把错误路由或无权限页面显示为可用，访问链接与被探测服务也可能不是同一实例。 | 对每个服务定义唯一可验证健康端点和期望 2xx/响应字段，launch URL 从同一服务配置投影。 |

第二轮没有执行 LIVE，也没有用上述源码事实推导当前 ReleaseIdentity 的运行结论；所有 `CONFIRMED` 只表示该实现矛盾可由源码直接定位。

### 最终轮封口：运行权威、可复现入口与产品完整性

最终轮在 2026-09-22 读取当前 `main@552b3b8`、执行只读 I10 inspector 和 `demo.ps1 status`。当时 `demo status` 报告 v4 身份 `46b5ebda...e585b`、服务 `READY`；I10 inspector 同时报告 v3/Flowise 身份 `dab2cf70...77982`、当前 `0/18`、公共 API 回读证据过期。以下运行事实只代表该时点，不升级为 LIVE_E2E 或发布通过。

#### P0：完整产品入口或唯一运行权威不存在

| ID | 状态 | 问题与直接证据 | 可复现影响 | 最小修复门 |
|---|---|---|---|---|
| FINAL-P0-01 | CONFIRMED | `demo.ps1 status` 使用 CLI v4 ReleaseIdentity，当前返回 `46b5...e585b`；现有 Harness inspector/acceptance 仍从 Flowise publication 构造 v3 身份，返回 `dab2...77982`。v4 lifecycle 又明确把 Flowise 进程列为 forbidden runtime。 | 同一机器同时存在两个“当前身份”和两套验收账本；Quality、旧 inspector、CLI 与发布裁决无法回答同一个版本是否通过。 | 明确一次性切换点：v4 成为唯一当前身份/账本/inspector/Quality 数据源；v3 与 Flowise 只允许历史只读，所有当前命令拒绝读取其 publication 或 acceptance。 |
| FINAL-P0-02 | CONFIRMED | 根入口把 `verify` 列为合法命令，但没有实现分支，最终固定返回 `DEMO_COMMAND_NOT_IMPLEMENTED`；README 也明确写着 verify 尚未实现。 | 用户要求的六命令复现链在最后一步必然失败，无法从根入口得到全产品验收结论。 | 实现 `demo.ps1 verify`：依次执行当前身份合同/集成门、银行黄金链、CLI L1/Full18 状态和证据验证；任何失败返回对应层错误码，不启动第二套发布流程。 |
| FINAL-P0-03 | CONFIRMED | 两个 Keycloak realm 文件没有任何 users；prepare/up 不创建演示客户或运营员；`run-golden-path` 临时创建随机用户和客户端，并在 finally 全部删除。 | 新克隆启动后页面存在，但用户没有可登录账号，无法人工完成“客户转账→运营回读”的演示；自动 smoke 通过也不能替代产品可用性。 | prepare 以幂等方式创建固定合成演示用户、角色和客户映射，将本机凭据写入忽略文件并由 status 指向其位置；黄金链复用但不删除这些基线身份。 |
| FINAL-P0-04 | CONFIRMED | v4 Full18 的总 catch 对任意异常都写 `FAILED_DETERMINISTIC`；ledger 虽声明 `FAILED_RECOVERABLE`，执行器没有按 transport/依赖/产品断言分类。 | 短暂模型、MCP、浏览器或银行服务故障也会永久冻结当前 case，违反“首次确定性失败停止”的语义并阻断合法恢复。 | 只把稳定重现的合同/业务断言错误记为 deterministic；已分类临时依赖故障写 recoverable，保留同一 Journey/identity 的恢复入口；结果未知不得自动重试有副作用步骤。 |

#### P1：状态、身份和认证合同仍会制造错误产品结论

| ID | 状态 | 问题与直接证据 | 影响 | 最小修复门 |
|---|---|---|---|---|
| FINAL-P1-01 | CONFIRMED | Gateway `/health` 固定返回 200，不探测 Bank Channel；`demo status` 只检查容器处于 running，不读取 Compose health；`doctor` 的 bank 检查又只请求这个固定健康页，browser 只检查 executable 文件存在。 | Bank Channel 已死、浏览器不可执行或模型只返回空内容时，根状态/doctor 仍可能报告 READY。 | Gateway health 透传关键下游 readiness；status 使用 compose health；doctor 实际启动浏览器最小页并要求模型返回非空预期内容，逐项显示失败边界。 |
| FINAL-P1-02 | CONFIRMED | v4 ReleaseIdentity 由文件内容组构造，但没有 `sourceCommit` 字段；manifest 仍把 `services/mock-clearing-service` 和 `flowise/i10/s9-portability-policy-v1.json` 纳入当前产品身份。 | 身份不满足既定“源码提交参与身份”合同，历史/禁止运行资产的改动却会让正式 CLI 产品身份漂移。 | identity 显式绑定 Git commit 与 dirty-state policy；从当前组移除 Flowise 和默认 Mock，只保留产品源码、合同、构建产物、模型绑定和正式清单。 |
| FINAL-P1-03 | CONFIRMED | `product-doctor` 对 model base URL 去尾斜杠后计算 hash；lifecycle 和 demo freeze 对原始字符串计算 hash。 | 同一端点只因末尾 `/` 不同便生成不同 model binding/ReleaseIdentity，doctor 显示的摘要也可能与运行身份不一致。 | 建立唯一 `normalizeModelEndpoint()`，doctor、prepare、freeze、lifecycle 和 verifier 全部调用同一实现并加等价 URL 合同测试。 |
| FINAL-P1-04 | CONFIRMED | Customer Portal 默认展示账号密码登录，直接用 OAuth password grant；customer Keycloak client 明确 `directAccessGrantsEnabled: true`，同时又实现 Authorization Code + PKCE。 | SPA 直接处理用户密码并维护两套认证路径，扩大凭据暴露面和测试矩阵，也偏离当前浏览器客户端标准登录边界。 | 删除 password grant 与页面密码提交，只保留 Authorization Code + PKCE；演示账号仍由 Keycloak 登录页输入。 |
| FINAL-P1-05 | CONFIRMED | 两个门户的 access token 只存在模块内存，没有 refresh token、silent renew 或 expiry 处理；刷新页面立即丢失本地认证状态。 | 页面刷新、前端热更新或长时间演示会被动退出；后端 401 也不会统一触发重新认证并返回原页面。 | 采用 OIDC session 恢复：内存 token + Keycloak 会话静默重新授权或明确重定向，统一处理 expiry/401；不把长期 token 写 localStorage。 |

#### P2：复现输入仍未完全冻结

| ID | 状态 | 问题与直接证据 | 影响 | 最小修复门 |
|---|---|---|---|---|
| FINAL-P2-01 | CONFIRMED | PostgreSQL、Keycloak、Gateway 使用 digest 固定镜像；Prometheus、Grafana、Loki 和 OTel Collector 仅写可移动 tag。 | 同一 Git 提交在不同时间拉取的观测组件字节可能不同，SBOM、漏洞结果和演示行为无法严格复现。 | 在 `infra/versions.lock.yaml` 记录并由 Compose 使用全部基础镜像 digest；prepare 校验实际 image id 与锁文件一致。 |

至此，静态源码、当前只读运行状态、产品入口和发布控制面均已覆盖。仍未执行会写状态的 Full18、发布、reset 或冷启动，因此最终轮只完成缺陷封口，不生成新的 ReleaseIdentity 或 GO/NO-GO。

## 4. 两种整体设计

### 方案 A：两个模块化单体（推荐）

```text
bank-channel
  interface: customer-api / operations-api / test-support-api
  application: identity / accounts / transfers / loans / operations
  domain: Transfer, Beneficiary, LoanApplication, policies
  ports: Fineract*, NotificationSink, AuditSink, Clock
  infrastructure: jdbc repositories / fineract-http / keycloak mapping

test-agent
  interface: hz-agent / MCP / quality-read-api
  application: intake / authoring / execution / evidence / release
  domain: Journey, Run, Decision, EvidenceSet, ReleaseDecision
  ports: Model, BrowserWorker, CredentialVault, ArtifactStore
  infrastructure: sqlite repositories / openai-http / playwright worker
```

收益：部署拓扑不变，能以小 diff 逐块迁移；事务和状态源保持当前边界；适合当前单机演示与开源复现。代价：需要先建立包级边界和少量端口，短期仍共享进程。验证：每迁移一个用例，旧 API 合同不变，模块禁止依赖测试以机器方式通过。

### 方案 B：按能力拆微服务（暂不采用）

拆为 identity/accounts/payments/loans/agent-authoring/agent-execution/evidence 等独立服务。收益是部署隔离清晰；代价是立即引入分布式事务、服务发现、契约版本、更多镜像和恢复顺序，而当前主要问题是代码边界未形成，不是单进程容量。验证成本也会显著超过演示产品价值。

裁决：先执行方案 A。只有某模块已经具备独立数据所有权、独立发布需求和被观测到的资源隔离问题时，才允许从模块化单体提取服务。

## 5. 目标业务边界

### 银行系统

| 模块 | 拥有的行为 | 不允许拥有 |
|---|---|---|
| identity | Keycloak subject 与 Fineract client 映射、当前客户查询 | 账户余额和交易事实 |
| accounts | 从 Fineract 查询账户/余额/交易，只做读模型映射 | 本地余额表、转账流程 |
| transfers | Transfer aggregate、幂等、状态收敛、核心 reference、回执投影 | 伪造核心入账、直接操作其他模块表 |
| loans | 贷款申请/审批流程与 Fineract loan port | 文档物理存储和全局审计 SQL |
| operations | 聚合只读视图与操作用例 | 直接跨表拼接全部领域 |
| test-fixture | 调用各模块 fixture port 与 Fineract test support | 任意业务表 DELETE、生产 profile |

### CLI Agent

| 模块 | 拥有的行为 | 不允许拥有 |
|---|---|---|
| goal-intake | 自然语言目标与 application profile 合并 | 要求用户写内部 ID/URL |
| journey | Journey 状态机、用户决策、session 恢复 | 浏览器与 SQLite 细节 |
| authoring | 模型结构化与受合同约束的 candidate | 执行状态和发布裁决 |
| execution | 提交 Run/Task、读取 Worker 终态 | 改写 Journey 历史 |
| evidence | artifact 登记、事实核验、只读质量投影 | 人工编辑 GO |
| release | identity 绑定、suite 汇总、GO/NO-GO | 启停开发者已有服务 |
| MCP | 协议、认证、输入 shape、错误透传 | 业务状态推断 |

## 6. 重构落地任务包

任务顺序固定；每包控制在 1—3 天，只迁移一个可验收纵切面，不双写、不保留新旧回退。

| 包 | 目标与微观步骤 | 最小验证 | ReleaseIdentity |
|---|---|---|---|
| RF-048 权威与死代码收口 | 1. 将 v4 设为唯一当前 ReleaseIdentity/ledger/inspector；2. v3/Flowise 只保留历史只读；3. 删除 CI Flowise gate；4. 证明无引用后删除旧 `bank-channel` 和 legacy web；5. 修正 current dependency map。 | 当前命令只返回一个身份；搜索/构建/CI 配置合同；Compose config | 影响 |
| RF-049 转账结果收敛 | 1. 用生产组件重现核心拒绝、核心超时、响应丢失和本地提交失败；2. 增加 `CORE_RESULT_UNKNOWN`；3. 将远程调用移出本地事务；4. 同一核心幂等键回读后才能 SETTLED/FAILED；5. 本地 ledger 改称 projection。 | Java integration + Fineract sandbox；未知结果不得出现第二次扣款 | 影响 |
| RF-050 转账规则闭环 | 1. 幂等 scope 加 subject/operation；2. 风险评价接入核心提交前；3. 统一 return 状态转换；4. 冲正改为 pending/unknown/confirmed；5. 补跨主体、return、并发 checker 集成测试。 | transfer/risk/reversal integration + 黄金转账 | 影响 |
| RF-051 日终与逐笔对账 | 1. EOD run 先登记幂等键；2. 每个核心作业持久化步骤；3. 逐 transaction/reference/amount/currency 对账；4. 只有零未解释差异才推进日期；5. 用中断测试证明恢复不重跑成功步骤。 | EOD integration：正常、差异、中断恢复各一次 | 影响 |
| RF-052 审计与事件投递 | 1. 审计数据库串行追加并覆盖完整记录；2. 删除静默 null/`{}`；3. outbox 原子 claim；4. 死信状态改为 `DEAD_LETTERED`；5. 消费者按 event id 去重。 | 审计并发/篡改 + 双 publisher + DLQ integration | 影响 |
| RF-053 客户读模型真实性 | 1. 删除金额 abs/0 和 1970 回退；2. 明确交易类型映射；3. statement 使用核心余额/固定排序；4. 原始核心错误不出公共响应；5. 删除通用 savings command，改显式动作；6. 收款账户去重改用服务端 HMAC。 | mapping/statement/account-command/beneficiary contract + 页面 smoke | 影响 |
| RF-054 贷款状态机 | 1. 冻结 DRAFT→SUBMITTED→SCORED→APPROVED→CORE_SUBMITTED；2. 修正角色路由；3. maker/checker 使用条件更新；4. 页面发送并展示真实字段/状态/利率；5. 列表呈现本地到核心的完整状态；6. 文档必须绑定真实受控对象。 | 贷款申请、文档到核心提交 integration + browser E2E | 影响 |
| RF-055 测试支撑与演示身份 | 1. fixture 单源；2. prepare 幂等创建固定合成客户/运营员及映射；3. 各模块实现 reset/seed port；4. test-support 移到独立 profile/listener；5. 默认 Compose 移除 Mock clearing；6. 删除自实现逻辑的假单测。 | fresh prepare 后两门户可登录；seed/reset 两次；正式 profile 测试路由 404 | 影响 |
| RF-056 银行模块边界 | 1. customer/internal JWT 增加 audience/azp 校验；2. 客户门户只保留 PKCE 并恢复 OIDC session；3. 迁移 statement 的 controller-to-controller 依赖；4. 提取四个 Fineract ports；5. Repository 独占 SQL；6. 运营文档固定状态转换和乐观版本；7. 加最小 ArchUnit。 | JWT issuer/audience、登录刷新 integration + 单元、合同、银行黄金链 | 影响 |
| RF-057 CLI 单一路径 | 1. 删除 approve/reject 与 exit 20；2. application profile 提供 URL/target；3. goal 只保留业务文本；4. 错误码透传；5. RUNNING reconcile；6. Full18 区分 deterministic/recoverable/unknown；7. 默认 keepalive；8. 补 `release verify` 并更新版本。 | CLI contract + interrupted/transient/deterministic integration + L1 | 影响 |
| RF-058 业务证据验证 | 1. 分开 artifact manifest 与 bank ledger；2. 定义 DOM/NETWORK/TRACE/业务账务内容合同；3. 从工件提取并核验断言；4. 绑定 Journey/Run/Correlation/core transaction/ReleaseIdentity；5. verifier 自动 GO/NO-GO。 | 伪造 kind、空 network、错误金额、错误核心 id 必须失败 | 影响 |
| RF-059 Harness 与 MCP 边界 | 1. Harness 依次切 Journey/execution/evidence/release service 与 repository；2. MCP 按能力拆 tool modules；3. 注册器只组合；4. 保持一个 SQLite transaction coordinator 和公开工具 schema。 | registered tests + Journey integration + 33 tool contract | 影响 |
| RF-060 Quality、状态与运营事实投影 | 1. Quality 统计按唯一 v4 身份；2. releases/gate 读取 verifier；3. Gateway/status/doctor 使用真实 readiness；4. doctor 运行最小浏览器与非空模型探针；5. 运营 KPI 区分受理和核心成功；6. 未对账不得 HEALTHY；7. 外部服务按期望 2xx 内容探测。 | Quality/operations/status/doctor contract + 两门户 browser smoke | 影响 |
| RF-061 Web 运行时共享 | 1. 提取 OIDC/PKCE/session；2. 统一 authenticated transport；3. 删除门户本地重复 fetch；4. U盾与费用等文案只表达已实现事实。 | 三前端 typecheck/unit/build + browser smoke | 影响 |
| RF-062 CI 与最终裁决 | 1. 全部镜像锁 digest；2. bank/web/agent/compose jobs；3. 路径覆盖全产品；4. 实现根 `verify`；5. 空库黄金链；6. 冻结含 source commit 的新身份；7. Full18、冷启动、故障恢复、发布验证。 | 六条根命令全部成功 + 全仓 CI + LIVE_E2E 18/18 + cold start | 冻结最终身份 |

### RF-048 实施结果（2026-09-22）

RF-048 已完成工程落地并进入 `REVIEW`。当前 v4 状态入口、Flowise 历史边界、CI/package/lifecycle/release-decision 清理、重复源码删除和依赖图修正的逐项证据见 [`batches/RF-048/evidence-index.md`](./batches/RF-048/evidence-index.md)。由于本批改变 ReleaseIdentity 且未获新身份激活授权，现有 Harness/MCP/Worker 保持运行但被正确标记为 `STALE_SOURCE`；不得把旧运行绑定冒充新源码身份。

### RF-049 实施结果（2026-09-22）

RF-049 已完成工程落地并进入 `REVIEW`。远程 Fineract 调用已移出本地事务；`CORE_RESULT_UNKNOWN`、同键回读、重入无二次 POST、Fineract 权威结算和 accounting projection 命名已落地。Java 60/60、两个前端构建、合同解析和空库迁移均通过，现有 Docker 服务保持运行。证据见 [`batches/RF-049/evidence-index.md`](./batches/RF-049/evidence-index.md)。本批未冻结新 ReleaseIdentity、未替换当前运行服务、未执行资金写入 LIVE。

### RF-050 实施结果（2026-09-22）

RF-050 已完成工程落地并进入 `REVIEW`。幂等记录按主体与操作隔离；风险决策在核心提交前进入转账状态机；Return 增加 pending/unknown/confirmed 路径；冲正采用单次提交认领、同键核心回读与 checker 所有权。现有状态迁移和真实黄金转账通过，证据见 [`batches/RF-050/evidence-index.md`](./batches/RF-050/evidence-index.md)。本批未冻结新 ReleaseIdentity，也不构成 Full18 或发布 GO。

## 7. 第一刀的实现模板

第一刀应从 RF-049 开始修真正的业务风险，同时让 RF-048 先完成无争议的权威清理。RF-049 必须先用生产组件锁定四种可观察结果：明确成功、明确拒绝、结果未知、尚未提交；不能继续用一个宽泛异常代表后三者。转账用例模板如下：

```java
public TransferResult execute(TransferCommand command) {
  Transfer transfer = transfers.lockOrCreate(command);
  if (transfer.isTerminal()) return transfer.result();

  transfer.markCoreSubmissionPending();
  transfers.save(transfer);                 // 本地短事务结束

  CoreTransferResult core = coreTransfers.submit(command.coreRequest());

  return transactions.required(() -> {
    Transfer current = transfers.lock(command.transferId());
    current.settleFrom(core);               // 同一 idempotency key 可重入收敛
    transfers.save(current);
    projections.record(current);
    return current.result();
  });
}
```

这里不增加备用账务、静默重试或第二真相源。若核心结果未知，Transfer 进入明确的 `CORE_RESULT_UNKNOWN`，由同一幂等键执行回读/收敛；没有核心成功事实就不能写 `SETTLED`。

## 8. 完成判定

整体重构完成必须同时满足：

1. 银行 Controller 不直接使用 `JdbcTemplate`，不存在 controller-to-controller 依赖。
2. Fineract 的客户、账户、转账、贷款端口分离；任何余额/交易成功声明来自核心回读。
3. 默认 Compose 不启动 Mock clearing，test-support 不经 public gateway。
4. CLI 自然语言不要求 URL、target system 或 credential ref；中断后的正式 Journey 可对账恢复。
5. MCP 没有业务状态推断，Harness 业务能力各自拥有 repository，运行代码不再以 I8/I9/I10 命名现行领域。
6. Flowise 不在启动、CI、发布或产品依赖中；历史资料不再混入当前实施顺序。
7. 新克隆 prepare/up 后存在可人工登录的合成客户和运营员；页面刷新可恢复 Keycloak 会话，客户密码不经过 SPA password grant。
8. `status`、`doctor`、Quality 和 `verify` 使用同一 v4 ReleaseIdentity；不存在第二套当前账本，READY 来自实际依赖与浏览器探针。
9. 根目录六条命令全部实现；全仓 CI、黄金银行链、L1、Full18、冷启动恢复均绑定同一含 source commit 的新 ReleaseIdentity。在这些门通过前只称“重构实现/静态或集成验证完成”。

本文件是重构问题与顺序基线，不是运行验收证据，也不改变现有 ReleaseIdentity。
