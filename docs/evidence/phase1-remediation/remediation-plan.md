# 阶段一修复计划 — v4 合规整改

> 范围：修复 v4 阶段一审计报告中识别的 3 个 P0、11 个 P1、6 个 P2 项目。
> 依据：`_implementation_plan/Apache_Fineract_Mifos_Agent_Implementation_Plan.md`（§1.3/§8/§10/§13/§17/§20/§23/§25/§27/§30）。
> 原则：契约优先（ADR-005）；Fineract 唯一事实源（ADR-001）；最小改动、不得扩大范围。
> 入口条件：本计划只列改动,不执行代码;实际修复由后续任务按此计划逐项落实。

---

## 0. 修复路线总览

| 波次 | 范围 | 优先级 | 预计工时 | 验收门 |
|------|------|--------|----------|--------|
| W1 | P0-1 ~ P0-3 | 阻断 | 1.5 ~ 2 天 | 客户转账 E2E、EOD 9 步、清算全状态可达 |
| W2 | P1-1 ~ P1-6 | 阻断(契约) | 3 ~ 4 天 | Page Catalog Lint、状态机守卫单测、Liquibase 全量管理、NUMERIC(19,2) |
| W3 | P1-7 ~ P1-11 | 阻断(测试) | 1.5 ~ 2 天 | Seed YAML 驱动、business-date 推进真实、assertPayment 含核心、mvnw、网关健康 |
| W4 | P2-1 ~ P2-6 | 建议 | 2 ~ 3 天 | 模块化分包、idempotency/outbox v4 列、correlationId 过滤、EOD 并发锁、告警 |

每波次结束必须运行 §29.1 的失败门禁与 §27 审查清单。

---

## 1. P0 阻断(必须先修,W1)

### P0-1 客户转账 403 真因核查
**现状**:`SecurityConfig.java:65-67` 已正确放置 POST `/api/customer/v1/beneficiaries`、`/api/customer/v1/transfers`
要求 `ROLE_CUSTOMER_MFA_VERIFIED`,其余 `/api/customer/v1/**` 要求 `ROLE_CUSTOMER`。
验收报告记录的 `/api/customer/v1/customers/**` 规则被移除问题在源码中不存在,但 E2E 仍返回 403。
**假设**:运行容器不是当前源码构建产物(旧 jar 或旧镜像)。
**改动方向(只再做诊断,不改代码)**:
1. 核对容器镜像 `image` digest 与 `bank-channel-service/target/*.jar` 的构建时间戳;
2. `docker compose ps` 查 `bank-channel-service` 启动时间与 `status`;
3. `docker inspect <container> | grep -i image` 比对本地 `docker images bank-channel-service`;
4. 必要时 `docker compose build --no-cache bank-channel-service && docker compose up -d --force-recreate bank-channel-service`;
5. 用 fixture `alice` 走 OIDC PKCE + MFA Step-up,再次提交转账,确认状态码 201。
**验收**:`curl -X POST http://127.0.0.1:18080/api/customer/v1/transfers` 带 alice MFA token 返回 201 非 403。
**预计**:0.5 天(如确为旧镜像);若确为代码缺陷(P1-2 状态机或 RBAC multipart 解析缺陷)则升级到 P1-2 修复。
**风险**:若系代码缺陷,需另写 `RoleAssignmentTest` 覆盖 `ROLE_CUSTOMER_MFA_VERIFIED` 解析链路。

### P0-2 日终补齐步骤 5/6/9
**v4 出处**:§20.1 日终顺序、§25 Phase 6 BANK-0601/0602。
**现状**:`EodController.java:36-100` 实现了步骤 1~4、7、8(READY_TO_ADVANCE 桩),
缺步骤 5(Fineract COB/Batch)、6(利息/费用/逾期)、9(推进业务日期)。
**改动方向**:
1. `FineractAdapter` 新增方法(契约优先,先写 OpenAPI 片段):
   - `runJobsBatch()` → `POST /api/v1/jobs` 或 `POST /api/v1/scheduler` 触发 `Apply Annual Fee/Apply Charges` 等
     (查 §12.3 API 映射基线确认 Fineract 1.x 的 `jobs` 端点)。
   - `postInterest()` → 调用 `POST /api/v1/savingsaccounts/{id}?command=applyAnnualFee|postInterest`
     或批量调用 `POST /api/v1/savingsaccounts?command=postInterest`。
   - `advanceBusinessDate(LocalDate nextDate)` → `POST /api/v1/businessdate` 详见 P1-7 描述。
2. `EodController.run(...)` 在步骤 4 后插入:
   - `COB_BATCH`:调用 `fineract.runJobsBatch()`,失败则 status=FAILED/recon=BLOCKED,记 `audit.record("EOD_COB_FAILED",...)`;
   - `INTEREST_FEES_OVERDUE`:调用 `fineract.postInterest()`,校验 `coreEntries` 形成对应分录;
   - 把步骤 8 从 `READY_TO_ADVANCE` 改为实际调用 `fineract.advanceBusinessDate(date.plusDays(1))`,
     返回 `newDate`,写入 `eod_run.reason`。
3. 失败分支统一写审计:`auditService.record("EOD_FAILED","SYSTEM","eod-controller","EodRun",date,"EOD","FAILED",reason,...)`。
**验收**:`POST /internal/eod/run` 返回 `stepsCompleted` 含 9 项,`newDate` 等于 `businessDate+1`;
账务侧 `GET /api/v1/businessdate/BUSINESS_DATE` 反映新日期。
**预计**:0.5 天。
**风险**:Fineract `jobs` 端点权限要求 `superuser`;通过 `fineract.username` service account 调用,
若该账户权限不足,需在 Mifos X 后台勾选 `Manage Jobs` 权限。

### P0-3 清算结果回传 transfer 状态机
**v4 出处**:§13.1 状态转换、§13.4 P0 模拟跨行流程、§25 Phase 4 退出条件。
**现状**:`MockClearingService.deliver(...)` 在 `clearing_payment.status` 上推进状态,
但从不回传 `transfer.status`;`MockClearingController` 也未做清算→转账桥接。
结果:`PENDING_CLEARING/TIMED_OUT/RETURNED` 三个状态在 transfer 表上不可达,
`TransferStateMachineTest` 中的相关转换无生产代码支撑 → 死代码。
**改动方向**:
1. 抽 `TransferStateMachine` 类(P1-2 前置)或直接在 `MockClearingService.deliver` 末尾:
   ```
   switch (status) {
     case SETTLED -> finalizeTransfer(transferId, clearingRef);
     case REJECTED -> failTransfer(transferId, "CLR_REJECTED", failureDetail);
     case RETURNED -> initiateReturn(transferId);     // SETTLED → RETURNED → REVERSAL_PENDING
     case TIMED_OUT -> markTimedOut(transferId);        // 终态(配合 P2 timeout_to_fail 缺口)
   }
   ```
2. `finalizeTransfer` 调用 `TransferProcessor.process(transferId)` 完成核心入账,写 `clearing_reference` 列。
3. `MockClearingService.determineStatus` 中 `TIMEOUT_THEN_FAIL` 在 `deliveryCount >= 3` 时改为 `FAILED`,
   修复 §20 异常场景终态缺口(同时覆盖 P2)。
4. `transfer_outbox` 在每次状态变化时追加事件,AsyncAPI `bank-events.yaml` 新增 `transfer.clearing.settled/rejected/returned` 事件类型。
**验收**:
- 9 个场景各跑一次,验证 `transfer.status` 终态正确;
- `transfer_state_history` 含 `PENDING_CLEARING → SETTLED/FAILED/RETURNED` 跳转;
- 重复/乱序回调不产生重复 `transfer_state_history` 行。
**预计**:1 天。
**风险**:`RETURN_AFTER_SETTLEMENT` 需要 `TransferReversalController` 接力,确保 reversal 与 clearing 共享一个事务边界。

---

## 2. P1 阻断(验收前必须修,W2~W3)

### P1-1 Page Catalog 与 React 对齐
**v4 出处**:§17.4 运营 API、§23.3 测试数据、ADR-005 契约优先。
**现状**:`contracts/catalogs/page-catalog.seed.yaml` 与 `apps/*/src/pages/*` 的 `data-page-id`/`data-testid` 不一致:
- 5 个 `pageId` 错(`customer.accounts` vs 实际 `customer.account.list` 等);
- 12 个页面在 React 中存在但 Catalog 缺漏(`Customer Profile/SecuritySettings/Messages/Documents/LoanList/LoanDetail`,
  `Operations` 的 `AuditViewer/Clearing/OpsDocuments/PaymentMonitoring/RiskAlerts/RiskCases/SystemHealth`);
- `transfer-form` readyMarker 在 `TransferCreate.tsx` 中无 `data-testid="transfer-form"`。
**改动方向**:
1. 遍历 React 代码提取 `{PageId, dataPageId, dataTestId}` 三元组到 `tools/extract-page-attrs.mjs`;
2. 自动生成 `page-catalog.seed.yaml`(保留人工 label/role 字段);
3. 修复 `TransferCreate.tsx` `<form onSubmit={...}>` 添加 `data-testid="transfer-form"`(P1-9 同时覆盖);
4. 将 `TestSupportController.pages()` 改为从 YAML 读取或与 YAML 同步生成,**消除硬编码**。
**验收**:
- `npm run catalog:lint`(新增脚本)模式:YAML ↔ React 一致性 0 diff;
- 运营 API `/internal/test-support/v1/pages` 输出与 YAML 完全一致。
**预计**:1 天。
**风险**:React 端使用 antd `Form` 时 `data-testid` 透传需测试,antd 4.x/5.x 行为不同。

### P1-2 生产状态机强制类
**v4 出处**:§10.3 状态枚举、§13.1 状态转换、§25 Phase 3 退出条件(非法状态转换测试全部通过)。
**现状**:`TransferProcessor` 用 `if (!"CREATED".equals(s) && !"VALIDATING".equals(s))` 防止重复处理,
`TransferReversalController` 类似硬编码;转换矩阵只存在于 `TransferStateMachineTest` 的 `Map` 中。
非法转移(如 `FAILED → SETTLED`)在生产路径无运行时守卫。
**改动方向**:
1. 新建 `local.bank.channel.statemachine.TransferStateMachine`:
   - 定义 `ALLOWED_TRANSITIONS` 矩阵(12 态,见 §10.3);
   - `checkTransition(from, to)` 抛 `IllegalStateTransitionException`;
   - `transitionState(transferId, from, to, ...)` 调用 `checkTransition` 后再写 `transfer_state_history`。
2. `TransferProcessor`/`TransferReversalController`/`MockClearingService桥接` 改为委托 `stateMachine.transitionState`;
3. `version` 列用于乐观锁:`UPDATE ... WHERE transfer_id=? AND version=?`,影响行数为 0 抛 `ConcurrentModificationException`。
**验收**:`TransferStateMachineTest` 覆盖 12 态 × N 转移;非法转移测试新增 ≥5 例全部抛异常。
**预计**:1 天。

### P1-3 schema.sql → Liquibase 全量迁移
**v4 出处**:ADR-005 契约优先、§23.3 测试数据、§25 Phase 1 BANK-0104。
**现状**:`schema.sql` 管理 19/20 表,`db/changelog/v1-v4-additions.yaml` 仅管 1 表;
运行时 Java `ALTER TABLE` 是第三种变更机制 → 三套并存违反 §29.1 失败门禁。
**改动方向**:
1. `db.changelog-master.yaml` 增加 `v2-full-schema.yaml`,包含全部 20 表的 `createTable` changeset;
2. `application.yml` 关闭 Spring Boot 自动 `schema.sql` 执行(`spring.sql.init.mode: never`),
   Liquibase 通过 `@Bean Liquibase` 启用 `dropFirst=false`;
3. 运行时 `ALTER` 合并到 Liquibase(删除源码中 `jdbc.update("ALTER TABLE...")`);
4. 同一 changeset 的 `preConditions` 标 `onFail=MARK_RAN` 兼容历史库。
**验收**:`./mvnw liquibase:update` 在空库与已存在库上均成功;`schema.sql` 仅保留为参考文档,不参与运行时。
**预计**:1 天。

### P1-4 金额精度 NUMERIC(19,2)
**v4 出处**:§9.2 金额类型、§10.2 核心表 DDL。
**现状**:`transfer.amount` 与 `loan_application.requested_amount` 为 `NUMERIC(20,4)`,
而 `ledger_entry.debit/credit` 与 Fineract 总账为 `NUMERIC(19,2)`,跨表精度不一致导致对账失败。
**改动方向**:
1. Liquibase changeset:`ALTER COLUMN amount TYPE NUMERIC(19,2) USING amount::NUMERIC(19,2)`;
2. `ALTER COLUMN requested_amount TYPE NUMERIC(19,2) USING ...`;
3. `MoneyTest` 已验证 `BigDecimal` scale=2 复用即可;
4. 前端 `TransferCreate` 限制小数位 2 位。
**验收**:`\d transfer` 显示 `numeric(19,2)`;转账 12.3456 元被拒绝(校验 `amount.scale() <= 2`)。
**预计**:0.5 天(含数据迁移评估)。
**风险**:已有数据含 4 位小数时迁移会被截断;先执行 `SELECT count(*) WHERE amount != round(amount,2)` 评估。

### P1-5 可变表补 updated_at/version
**v4 出处**:§10.2 数据库原则、§27 审查清单。
**现状**:12+ 表缺 `updated_at`;8 表缺 `version`;部分表 `version INTEGER` 应为 `BIGINT`。
**改动方向**:Liquibase changeset 为以下表补列:
| 表 | updated_at | version |
|----|-----------|---------|
| idempotency_record | + | +(BIGINT) |
| customer_identity | + | + |
| beneficiary | + | + |
| notification | + | - |
| transfer_receipt | + | - |
| transfer_outbox | + | +(BIGINT) |
| clearing_payment | + | + |
| loan_document | + | + |
| loan_approval | + | +(BIGINT) |
| eod_run | + | - |
| reconciliation_run | + | - |
| dead_letter_event | + | - |
| security_audit_event | + | - |
| ledger_entry | + | - |

`risk_decision`/`transfer_reversal`/`loan_application` 的 `version` 由 `INTEGER` 改 `BIGINT`。
**验收**:`SELECT table_name FROM information_schema.columns WHERE column_name='updated_at' GROUP BY ...` 返回数 ≥ 可变表数。
**预计**:0.5 天。

### P1-6 Fixture Seed 读 YAML + 调 Fineract API
**v4 出处**:§23.3 测试数据、§16-19 Fixture Registry。
**现状**:`TestSupportController.seed()` 硬编码 `fineract_client_id=1/2`,
不读 `contracts/fixtures/baseline-fixtures.yaml`,不调 Fineract API 创建 client。
**改动方向**:
1. `contracts/fixtures/baseline-fixtures.yaml` 定义:
   - `customers.alice`: `firstName, lastName, mobileNo, emailAddress,dateFormat,locale`;
   - `accounts.alice.primarySavings`: `productId, fieldOfficerId, submittedOnDate, ...`;
2. `TestSupportController.seed()` 解析 YAML,调用 `fineract.createClient(...)` + `fineract.createSavingsAccount(...)`;
3. 把返回的 `clientId/accountId` 写入 `customer_identity` 与返回体;
4. `reset()` 调用前清 `ledger_entry`(P2-2 同时覆盖)。
**验收**:连续两次 `POST /fixtures:seed` 不发生 idempotency 冲突;Fixture 之间引用 `customer.alice.fineractClientId` 能解析到最新 ID。
**预计**:1 天。

### P1-7 business-date:advance 调用 Fineract
**v4 出处**:§20.3 时间旅行测试。
**现状**:`TestSupportController.advanceBusinessDate()` 返回 `LocalDate.now().plusDays(1)`,不调 Fineract。
**改动方向**:
1. `FineractAdapter.advanceBusinessDate(LocalDate nextDate)`:
   `POST /api/v1/businessdate` body `{ "date":[y,m,d], "dateFormat":"yyyy-MM-dd", "locale":"en" }`;
2. `TestSupportController.advanceBusinessDate()` 实际调用并校验:
   - 先 `assertLedger` 全局平衡(本地 + 核心);
   - 不平衡时 `BLOCKED`;
   - 通过后调用 `advanceBusinessDate`,返回 Fineract 回应的新日期。
**验收**:运行 `advanceBusinessDate` 后 `GET /api/v1/businessdate/BUSINESS_DATE` 反映新日期;EOD 完成后该端点可再推进。
**预计**:0.5 天。

### P1-8 assertPayment 验证核心交易
**v4 出处**:§23.5 资金测试强制断言。
**现状**:`TestSupportController.assertPayment(...)` 仅查本地 `transfer`/`state_history`/`outbox`/`audit`,
不验证 Fineract 侧是否真实生成 `accounttransfer` 交易。
**改动方向**:
1. `assertPayment` 新增 `coreVerification` 字段:
   - `fineract.savingsTransactions(source, fromDate, toDate)` 遍历,匹配 `correlationId` 或 `transferId`;
   - 比对 `coreReference` / Fineract `transferId` 是否在核心侧存在;
   - 借贷金额与本地 `ledger_entry` 一致;
2. 返回:`{ coreTransactionFound: true/false, coreAmountMatched: true/false, coreEntryCount: n }`。
**验收**:`assertPayment` 在核心侧缺失交易时返回 `coreTransactionFound=false`;审计脚本据此 FAIL。
**预计**:0.5 天。

### P1-9 transfer-form data-testid
**v4 出处**:§13 P0 本行转账流程、Page Catalog 契约。
**现状**:`TransferCreate.tsx` 的 `<form>` 未加 `data-testid`。
**改动方向**:在 `<form onSubmit={handleSubmit(onSubmit)}>` 标签添加 `data-testid="transfer-form"`。
**验收**:DOM 查询 `[data-testid="transfer-form"]` 唯一存在。
**预计**:5 分钟(P1-1 一并实现)。

### P1-10 Maven Wrapper 与构建脚本
**v4 出处**:§29.2 推荐命令、§7.2 必须执行的命令。
**现状**:仓库无 `mvnw`/`mvnw.cmd`,无 Maven 环境的机器无法构建。
**改动方向**:
1. 在 `services/bank-channel-service/` 运行 `mvn -N wrapper:wrapper -Dmaven=3.9.6`;
2. 提交 `mvnw`、`mvnw.cmd`、`.mvn/wrapper/maven-wrapper.properties`;
3. `pom.xml` 加 `<maven.compiler.release>21</maven.compiler.release>` 显式锁定。
**验收**:`./mvnw -q -DskipTests package` 在无 Maven 的纯净环境构建成功。
**预计**:0.5 天(含发布版本基线锁定)。

### P1-11 网关 Docker healthcheck
**v4 出处**:§6.2 Docker 网络、§21 可观测性。
**现状**:网关容器 healthy 状态判断异常。
**改动方向**:
1. `infra/compose.yml` 中 `gateway` 服务加 `healthcheck:
   test: ["CMD","curl","-fs","http://127.0.0.1:18080/actuator/health"]
   interval: 10s timeout: 3s retries: 5 start_period: 30s`;
2. 依赖 `bank-channel-service` 与 `mock-clearing-service` 在 `condition: service_healthy` 之后启动;
3. `MonitoringController` 增加 `EOD_FAILED` 状态告警(P2 同时覆盖)。
**验收**:`docker inspect gateway --format '{{.State.Health.Status}}'` 输出 `healthy` 且非 `starting` 长期悬挂。
**预计**:0.5 天。

---

## 3. P2 建议(W4,不绑定最终验收)

| 编号 | 项 | 改动方向 | 预计 |
|------|----|----------|------|
| P2-1 | 模块化分包 | 按 §4.1 / ADR-006 把 `local.bank.channel` 拆为 `identity-link/customer-profile/accounts/beneficiaries/payments/risk/notifications/documents/reconciliation/audit` 10 个 package;类移动+`@ComponentScan` 不变;包级 `package-info.java` 注写 ADR-006 | 1 天 |
| P2-2 | idempotency_record 缺 v4 列 | Liquibase 补 `scope_key/status/resource_id/expires_at/updated_at/version`;`response_body` 改 `JSONB`(已有实现读字符串则保留视图) | 0.5 天 |
| P2-3 | outbox v4 表名/列名 | `transfer_outbox` 保留向后兼容视图或重命名为 `outbox_event`;补 `aggregate_type/event_version/headers/status`;`payload` `JSONB`(cast) | 0.5 天 |
| P2-4 | assertReconciliation 按 correlationId 过滤 | `TestSupportController.assertReconciliation` 增加查询 `reconciliation_run.details::jsonb -> 'correlationId' = ?`,返回 `matchedRuns` 数 | 0.5 天 |
| P2-5 | EOD 并发锁 | `SELECT pg_advisory_xact_lock(hashtext('eod-run'))` 加在 `EodController.run` 事务首行,防止双 EOD 同时推进 | 0.5 天 |
| P2-6 | MonitoringController EOD_FAILED 告警 | `MonitoringController` 增 `if latestEod.status==FAILED` 返回 503 + `X-Alert: EOD_FAILED`;`infra/compose.yml` 增告警通道 | 0.5 天 |

---

## 4. 横切(每波强制)

- 跑 §29.1 失败门禁:`contract-lint`、`schema-lint`(Liquibase 校验)、`catalog-lint`(React 一致性,新增)、`mvnw test`、
  `docker compose -f compose.channel.yaml -f infra/compose.yml up --wait --build`、E2E-001 本行转账、E2E-004 EOD。
- 跑 §27 审查清单全部 10 项,不通过则该波次不收尾。
- 跑 §1.4 阶段一 10 项退出条件,W3 结束时必须 ≥ 8 PASS / 2 PARTIAL / 0 FAIL 才允许启动 W4。
- 撤销清单 + 回滚命令:每波提交附 `git revert <sha>` 说明,测试失败时 5 分钟内可回滚。

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Fineract `jobs` 端点权限不足 | P0-2 不可完成 | Mifos X 后台勾选 service account 全权限;或写入 skill 文档记录降级方案(退化为定时任务) |
| 历史数据有 4 位小数 | P1-4 数据截断 | 先 `SELECT count(*) WHERE amount != round(amount,2)`,有则先 `UPDATE` 归一化再改类型 |
| 状态机重命名旧数据迁移 | P0-3 回传状态机重构 | 迁移先写 `transfer_state_history`,`UPDATE transfer SET status=...` 滞后,失败可只回滚 history |
| 契约 lint 无 Maven | 套件无法跑通 | W3 先完成 P1-10,在 W1/W2 期间用 `mvn`(若已装)兜底 |
| Liquibase 与 schema.sql 重复建表 | 启动失败 | `spring.sql.init.mode=never` + 打开 `Liquibase` 的 `dropFirst=false` + `preConditions onFail=MARK_RAN` |

## 6. 验收快照(W3 结束目标)

| 维度 | 当前 | 目标 |
|------|------|------|
| §1.4 退出条件 | 3 PASS / 2 PARTIAL / 5 FAIL | ≥ 8 PASS / 2 PARTIAL / 0 FAIL |
| §28 DoD | 3 PASS / 1 PARTIAL / 6 FAIL | ≥ 8 PASS / 2 PARTIAL / 0 FAIL |
| §27 审查清单 | 4 PASS / 1 PARTIAL / 5 FAIL | 10 PASS / 0 PARTIAL / 0 FAIL |
| ADR | 2 PASS / 1 PARTIAL / 2 FAIL | 5 PASS / 0 PARTIAL / 0 FAIL |
| P0 阻断 | 3 项 | 0 项 |
| P1 阻断 | 11 项 | 0 项 |

P2 全部完成是 nice-to-have,可在阶段一验收通过后另起阶段推进,不绑定最终签字。

---

_本计划只列改动方向与验收;实际修复由后续任务依据本计划逐项落实,每项完成需在 `docs/evidence/phase1-remediation/<id>.md` 留验收证据。_