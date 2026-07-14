# 阶段一修复执行计划（修订版，银行核心 Track）

> 状态：待执行。本文是当前仓库和运行中 `bank_channel` 数据库的修复基线，不代表已完成。
>
> 范围：仅 `mifos-channel` 渠道层。`mifos-isolated`（Fineract、其 PostgreSQL、ActiveMQ）为核心系统，不在本计划的配置或密钥修改范围内。
>
> 不变量：Fineract 是核心账务唯一事实来源；资金写操作不得绕过 `FineractAdapter`；不读取、不提交 `.env` 或密钥；不得修改已执行的 Liquibase changeset；不得自动 merge/push。
>
> 本计划属于 v5.4 外网演示完整产品中的银行核心 Track。它不替代 v5.4 回归测试平台 Track，也不代表 AI 编排、脚本生成或企业平台适配已经完成。

## 0. 执行前门槛

1. 记录 `git status --short --branch`；仅暂存本计划明确列出的文件。
2. 对渠道数据库创建可恢复备份，并执行恢复演练的只读前置检查。
3. 查询 `databasechangelog`。已有 `v3-p3-1/2/3` 记录，禁止修改 `v3-p3-transfer-order-v4.yaml`、`v3-p2-*` 或任何已应用 changeset。
4. 每个 schema 任务使用新的、顺序明确的 `v4-p0-*` / `v4-p1-*` changelog；每个 changeset 包含 precondition、数据回填、约束创建和 rollback 说明。
5. 每完成一个阶段，至少运行该阶段单测、`mvn test` 与相应 API/数据库断言。不得用 `final-regression.ps1` 的基础可用性检查替代金融业务验收。

## 1. P0：状态机与清算闭环

### P0-1 状态转换矩阵

修改 `payments/statemachine/TransferStateMachine.java`，使以下转换可用：

```text
PENDING_CORE_POSTING -> PENDING_CLEARING | SETTLED | FAILED
PENDING_CLEARING     -> SETTLED | TIMED_OUT | FAILED
SETTLED              -> RETURNED | REVERSAL_PENDING
VALIDATING           -> RISK_REVIEW | FAILED
```

`VALIDATING` 不得直接进入 `PENDING_APPROVAL` 或 `PENDING_CORE_POSTING`。所有正常路径必须先进入 `RISK_REVIEW`，再由风险决策进入 `PENDING_CORE_POSTING` 或 `PENDING_APPROVAL`。

同步修改 `TransferProcessor`，确保不会在删掉旧转换后触发 409。修正 `TransferStateMachineTest` 中对 `SETTLED -> RETURNED` 的错误断言，并新增矩阵全覆盖测试和非法转换测试。

验收：状态机的允许/拒绝集合精确匹配上表；金额高低两条处理路径均产生 `RISK_REVIEW` 历史记录。

### P0-2 清算超时传播

修改 `MockClearingService`：`TIMED_OUT` 回调从 `PENDING_CLEARING` 迁移到 `TIMED_OUT`，写状态历史、outbox 与审计；后续回调只能按明确定义的补偿路径处理，不能静默覆盖终态。

验收：`TIMEOUT_THEN_FAIL`、`TIMEOUT_THEN_SUCCESS`、重复回调和乱序回调均有独立集成测试；状态、历史、outbox 与审计记录一致。

## 2. P0：追加式数据库迁移

### P0-3 inbox_event 合规迁移

新增 changelog，为 `inbox_event` 补齐：`event_type`、`payload_hash`、`processing_status`、`failure_detail`、`created_at`。先为存量行回填可追踪的兼容值，再施加 NOT NULL/默认值；同步更新 `InboxService` 的写入、幂等 claim 和失败记录。

验收：列、默认值、约束与服务 SQL 一致；同一事件重复投递不产生重复业务效果。

### P0-4 transfer_order 兼容性迁移

保持当前主键 `transfer_id`，不在本阶段改名为 `id`。这是已部署 SQL 广泛使用 `transfer_id` 的兼容性边界。

新增 `customer_subject`，从 `subject` 回填；在确认无冲突后增加以下约束/索引：

```text
uq_transfer_idempotency (tenant_id, customer_subject, idempotency_key)
uq_transfer_correlation (tenant_id, correlation_id)
idx_transfer_owner_time (tenant_id, customer_subject, created_at DESC)
idx_transfer_status     (tenant_id, status, created_at)
```

`request_hash`、`correlation_id`、`business_date` 施加 NOT NULL 前，必须先定义并执行存量回填规则。`source_account_ref`、`source_fineract_id` 的类型重构需单独 ADR 和双读/双写计划，不与本次约束修复混做。

验收：迁移可在含历史转账的数据副本上完成；现有查询不因列名变更失效；新写入均带 `customer_subject`。

### P0-5 transfer_receipt 类型与外键

新增独立 migration：先验证全部 `transfer_receipt.transfer_id` 可转换为 UUID，再删除旧外键（如有）、显式转换 `CHAR(64)` 为 UUID，并创建指向 `transfer_order(transfer_id)` 的外键。

任何无法转换的数据都必须阻断发布并输出脱敏计数，不得截断或伪造值。该任务不依赖主键重命名。

验收：类型为 UUID、外键存在、孤儿行数为零。

## 3. P0：贷款资金操作边界

`LoanCoreController` 已将部分请求转发给 Fineract 且使用 `Idempotency-Key`，但尚未形成完整的渠道侧操作闭环。

先形成贷款操作的命令模型与状态定义，再实施：请求体哈希、渠道幂等记录、outbox、审计、失败码与补偿记录。会计事实必须由 Fineract 返回或其账务查询证明；不得在渠道数据库伪造 `ledger_entry` 作为核心账务。

验收：每种贷款资金写操作具备相同 key/同体重放、同 key/异体冲突、核心失败、网络超时重试和可对账的测试证据。

## 4. P1：安全、幂等与审计

### P1-1 幂等与 outbox 字段

追加 migration 将：

```text
idempotency_record.scope_key  -> VARCHAR(512)
idempotency_record.status     -> VARCHAR(32)
outbox_event.event_type       -> VARCHAR(160)
outbox_event.next_attempt_at  -> NOT NULL DEFAULT now()
```

对 `next_attempt_at` 先回填再加约束；查询改为不再依赖 NULL 表示“立即执行”。

### P1-2 清算回调签名

为 `MockClearingController.deliver` 增加签名头，并在进入业务逻辑前由服务层使用常量时间比较验证 HMAC-SHA256。密钥只通过现有安全配置注入，不进入日志、响应或版本库。

验收：无签名、错误签名、篡改 sequence/status 均返回 401；正确签名才允许状态转换。

### P1-3 反转请求幂等

为“创建反转申请”而非仅“审批”增加必填 `Idempotency-Key`、请求哈希与可重放响应。相同 key、不同原因必须返回 409。同步更新 operations OpenAPI。

### P1-4 审计哈希链

新增仅在 `local`/`test` profile 且受 `ROLE_TEST_SUPPORT` 保护的验证端点；不得开放通用内部匿名端点。

哈希输入必须包含稳定排序后的完整字段：previous hash、event/actor/tenant/resource/action/outcome、before/after JSON、requestId、correlationId 与持久化 timestamp。生成和验证必须共用同一 canonicalization 函数。

对账执行完成后写入审计事件。验收不仅验证正常链，还要对任意一条审计行的业务字段篡改返回失败位置。

### P1-5 Problem 契约

在全部 OpenAPI Problem schema 中定义 `requestId`、`correlationId`、`fieldErrors`；在 `ProblemHandler` 始终返回它们（可为空数组）。为参数校验错误补充实际字段错误。

### P1-6 事件契约

`coreReference` 不能同时无条件 required 又允许 CREATED 为 null。使用状态区分的 `oneOf` schema：核心处理后的事件要求非空，创建态允许缺失或 null。运行时事件发布逻辑必须与契约一致。

## 5. P2：测试支持、可观测性与部署加固

1. 扩展 Action Catalog 至覆盖贷款、清算、对账、EOD、风控、受益人、账户、文档和资料操作；每个 action 指向实际存在的权限、页面或 API。
2. 删除 `OutboxPublisher` 中无效的 `.replace(".", ".")`，但保留或调整队列名必须依据 AsyncAPI/JMS 消费者契约，不得以字符串猜测代替契约。
3. `assertLedger` 应请求或本地过滤到 correlationId；若 Fineract 不支持 transactionId 查询参数，明确使用可验证的本地过滤和限制，并将限制写入测试契约。
4. 为 Grafana 与 OTel Collector 增加健康检查；Prometheus、Grafana、Loki、OTel 与本地渠道镜像的不可变性策略单独说明。远程镜像使用 digest；本地构建镜像使用可追溯版本标签、构建输入哈希和发布记录，不能伪造 digest。
5. Fixture seed 只允许 `local`/`test` profile 和 `ROLE_TEST_SUPPORT`；创建转账/贷款 fixture 前需经过真实业务校验，不得将静态 YAML 直接视为可安全执行的资金指令。
6. `interestRatePerPeriod` 可改为 `BigDecimal("1.5")` 以避免二进制浮点序列化差异；验收只禁止金额字段使用 double，不要求消除全部数值字面量。

## 6. 契约与回归验收

在每个相关阶段执行：

```text
OpenAPI / AsyncAPI lint
mvn test
新增单元与集成测试
Liquibase update + 数据库结构断言
渠道 API 的认证、幂等、签名与错误契约测试
资金路径的状态历史、outbox、审计链、核心回执与对账断言
```

`scripts/test/final-regression.ps1` 保留为环境烟测，不作为阶段完成证据。阶段完成需要新增或扩展的金融回归套件全部通过。

## 7. 实施顺序

```text
0. 备份、DATABASECHANGELOG 检查、契约基线
1. P0-1/P0-2 状态机与清算测试
2. P0-3/P0-4/P0-5 追加式 schema migration
3. P0 贷款命令闭环设计与实现
4. P1 幂等、签名、反转与审计链
5. P1 Problem/事件契约
6. P2 测试支持、指标、健康检查和镜像可追溯性
7. 全量金融回归、备份恢复演练与人工复核
```

每个阶段失败即停止后续阶段，回滚只使用该阶段新增 migration 的预案或数据库恢复，不重写历史 changeset。
