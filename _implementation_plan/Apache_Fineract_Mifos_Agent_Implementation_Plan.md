# Apache Fineract + Mifos X 本地数字银行沙箱 Agent 实施规范

> 文档版本：1.0.0  
> 适用项目：`C:\Users\fujunye\Documents\实习\mifos-isolated`  
> 当前核心管理端：`http://127.0.0.1:18080`  
> 当前 Fineract API：`http://127.0.0.1:13000`  
> 当前租户：`default`  
> 文档性质：架构基线、数据契约、接口契约、Agent 执行规范、测试与验收规范  
> 目标环境：Windows + Docker Compose，本机隔离开发环境，不接真实资金流水

---

## 0. 文档使用方式

本文件是后续开发 Agent 的唯一上层实施基线。所有 Agent 在开始工作前必须完整读取本文件，并遵守以下规范性术语：

- **MUST / 必须**：不满足即不得合并。
- **MUST NOT / 禁止**：违反即回滚。
- **SHOULD / 应当**：除非在 ADR 中记录理由，否则必须执行。
- **MAY / 可以**：可选实现。

Agent 不得根据“系统能启动”推断业务功能已经完成。每个功能必须分别满足：

1. 接口或页面存在；
2. 参数已配置；
3. 端到端业务完成；
4. 核心账务结果正确；
5. 审计记录完整；
6. 自动化测试通过。

---

## 1. 项目目标与边界

### 1.1 最终目标

在不接入中国人民银行、CNAPS、银联、网联、公安实名核验、征信和监管生产系统的前提下，将现有 Fineract + Mifos X 员工后台扩展为一个可本地完整测试的数字银行沙箱，覆盖：

- 员工管理后台；
- 客户专用网上银行；
- 客户认证与多因素认证；
- 客户、账户、储蓄、贷款查询；
- 本行转账；
- 模拟跨行支付；
- 支付状态机、失败、退回和冲正；
- KYC、AML 和欺诈规则模拟；
- 电子回单、对账单和消息通知；
- Maker-Checker 双人复核；
- 会计核对、支付对账和日终处理；
- 自动化测试、监控、日志、备份和恢复。

### 1.2 非目标

本阶段明确不实现：

- 真实资金划拨；
- 真实银行卡发卡与密码机；
- 真实支付清算报文和专线；
- 真实身份证联网核验；
- 真实征信查询；
- 真实反洗钱、可疑交易或监管报送；
- 生产级双活、异地多活和硬件密码机；
- 面向公网的生产部署。

### 1.3 成功标准

系统必须通过第 18 节规定的端到端场景，并满足以下核心不变量：

```text
客户可用余额 >= 0，除非产品明确允许透支
任何已结算交易只能记账一次
任何冲正必须保留原交易且生成反向记录
任意业务日全部会计分录借方合计 = 贷方合计
客户 A 无法读取或操作客户 B 的数据
经办人不能复核自己提交的受控操作
重复请求不能生成重复资金交易
恢复备份后余额、流水、贷款计划、会计分录和审计链一致
```

### 1.4 v5.4 兼容性叠加基线

本 V4 方案落地后的银行系统必须直接作为 v5.4 回归测试平台的稳定测试目标，不得在 V4 完成后再通过临时页面、旁路数据库或一次性脚本“补出”测试适配层。V4 的业务能力、页面、状态机、测试数据和证据接口必须按以下兼容性要求建设：

1. **业务流程可人工重复**：客户登录、账户查询、流水查询、本行转账、模拟跨行、贷款、运营审核、冲正、日终和恢复均必须有明确页面入口、前置条件、成功终态和失败终态。
2. **业务终态可机器核验**：每个流程必须暴露稳定的业务状态、订单号、核心交易引用、客户/账户逻辑标识、Trace ID 和时间信息；禁止只依赖页面文本或截图判断成功。
3. **Fixture 可重置且命名空间隔离**：每个 RegressionCase 必须绑定独立 Fixture namespace；播种、重置、清理和状态查询必须可审计，禁止固定 Fineract 客户 ID、账户 ID 或跨案例共享可变数据。
4. **Baseline 同时覆盖页面与账务**：人工成功案例必须能够保存页面 URL、关键可见状态、业务状态、余额/流水/核心交易、审计事件和证据引用；页面一致不等于账务成功，账务成功也不等于页面成功。
5. **浏览器链路稳定**：Customer Portal、Operations Console、Mifos X 的关键页面必须提供稳定路由、语义化控件标识、可复现初始状态和成功后状态，供 Midscene 原子动作和 Playwright 脚本消费。
6. **测试平台只能走正式业务边界**：回归平台只能通过浏览器、Gateway、Bank Channel Service、Operations API 和明确的测试支持接口操作；不得直接写 Fineract 数据库，不得把 AI 生成结果当作账务事实。
7. **事件与证据可关联**：业务请求、状态变化、Fineract 交易、通知、对账、页面证据和恢复决策必须能通过 `caseId`、`runId`、`actionId`、`traceId` 或等价关联键串成证据链。
8. **演示与内网迁移契约不变**：外网演示只替换环境、虚构/脱敏数据、模型和认证适配器；不得为外网演示删减资金安全、审计、对账、独立验证和恢复门禁。

V4 的详细兼容矩阵、v4 阶段到 v5.4 四阶段的映射和新增退出条件见 [`docs/architecture/v4-v54-compatibility-baseline.md`](../docs/architecture/v4-v54-compatibility-baseline.md)。本节优先于 V4 中任何“系统可启动即完成”的简化判断；V4 业务功能只有同时满足本节和原有账务不变量，才允许作为 v5.4 的正式测试目标。

---

## 2. 强制架构决策

### ADR-001：Fineract 是核心账务唯一事实源

- 客户、储蓄账户、贷款账户、核心交易和总账以 Fineract 为事实源。
- 新增服务禁止直接写入 `fineract_default` 和 `fineract_tenants`。
- 新增服务只能通过 Fineract REST API 调用核心能力。
- 只读分析服务可使用只读数据库连接，但不得用于业务判断或回写。

### ADR-002：客户渠道不得直接访问完整 Fineract API

浏览器只能访问 API Gateway 和 Customer BFF：

```text
Customer Web -> API Gateway -> Customer BFF -> Fineract Adapter -> Fineract
```

禁止：

```text
Customer Web -> Fineract
Customer Web -> PostgreSQL
Customer Web -> ActiveMQ
```

### ADR-003：默认采用独立 Customer BFF

默认实施路径为独立 `customer-bff`，原因：

- 当前 Fineract 精确版本尚未完成基线识别；
- 社区 Self Service Plugin 当前要求 Fineract `1.15.0-SNAPSHOT`；
- 该插件目前没有正式 Release；
- 不允许为接入插件而直接升级或替换当前已稳定运行的核心系统。

仅当 Agent 完成兼容性验证并通过回归测试后，才允许在 ADR 中切换为插件模式。

### ADR-004：扩展服务使用独立数据库

- 禁止在核心数据库中创建渠道业务表。
- 新增独立 PostgreSQL 容器或实例，默认容器名 `bank-channel-postgres`。
- 默认数据库：`bank_channel`、`bank_identity`。
- 数据卷：`mifos_isolated_channel_pg_data`。
- 不映射到 Windows 主机端口。

### ADR-005：采用契约优先

开发顺序必须为：

```text
业务状态机 -> OpenAPI/AsyncAPI/JSON Schema -> 契约测试 -> 实现 -> 集成测试
```

禁止先写 Controller 再补接口文档。

### ADR-006：服务初期采用模块化单体，避免无效微服务化

P0 阶段后端使用一个 Spring Boot 模块化单体 `bank-channel-service`，内部模块包括：

- identity-link；
- customer-profile；
- accounts；
- beneficiaries；
- payments；
- risk；
- notifications；
- documents；
- reconciliation；
- audit。

只有当模块出现独立扩缩容、独立故障域或独立发布需求时，才拆分服务。

---

## 3. 规范与版本策略

### 3.1 契约标准

| 类型 | 标准 | 项目决策 |
|---|---|---|
| HTTP API | OpenAPI | 固定使用 3.1.1，避免工具链对 3.2.0 支持不一致 |
| 数据 Schema | JSON Schema | Draft 2020-12 |
| 异步 API | AsyncAPI | 3.1.0 |
| 事件封装 | CloudEvents | 1.0.2 JSON Format |
| HTTP 错误 | Problem Details | RFC 9457 风格 |
| 链路追踪 | W3C Trace Context | `traceparent`、`tracestate` |
| 日期时间 | ISO 8601 / RFC 3339 | 服务时间一律 UTC |
| 业务日期 | ISO 8601 Date | `YYYY-MM-DD`，不含时区 |
| 货币代码 | ISO 4217 | 默认 `CNY` |
| 国家代码 | ISO 3166-1 alpha-2 | 默认 `CN` |
| 语言 | BCP 47 | 默认 `zh-CN` |

### 3.2 技术基线

精确镜像版本必须由基线 Agent 读取现有 Compose 和容器后写入锁定文件。新增模块建议基线：

| 组件 | 约束 |
|---|---|
| Java | 21 LTS |
| Spring Boot | 3.x，与 Java 21 兼容的固定补丁版本 |
| Node.js | 22 LTS |
| 前端 | React + TypeScript + Vite，或 Angular；一经 ADR 确认不得混用 |
| PostgreSQL | 与当前 18.3 对齐，使用固定镜像 digest |
| Keycloak | 固定已验证版本和镜像 digest |
| 数据库迁移 | Liquibase |
| 测试容器 | Testcontainers |
| 浏览器 E2E | Playwright |
| 指标 | Prometheus |
| 仪表盘 | Grafana |
| 日志 | Loki + Promtail 或 OpenTelemetry Collector |
| 链路 | OpenTelemetry |

所有容器镜像必须从 `latest` 改为固定版本，基线完成后生成：

```text
infra/versions.lock.yaml
infra/images.lock.txt
```

---

## 4. 目标架构

```text
┌───────────────────────────────────────────────────────────┐
│ Browser                                                   │
│  - Mifos X Staff Web                                      │
│  - Customer Web                                           │
│  - Payment Operations Web                                 │
└───────────────┬─────────────────────────────┬─────────────┘
                │                             │
        ┌───────▼─────────────────────────────▼───────┐
        │ API Gateway / Reverse Proxy                 │
        │ TLS、CSP、CORS、限流、请求 ID、路由、审计    │
        └───────┬──────────────────────┬──────────────┘
                │                      │
       ┌────────▼────────┐    ┌────────▼──────────┐
       │ Keycloak        │    │ Bank Channel      │
       │ Customer Realm  │    │ Service / BFF     │
       │ Staff Realm     │    │ 模块化单体         │
       └─────────────────┘    └───────┬───────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
              ┌─────▼─────┐    ┌──────▼─────┐   ┌──────▼─────┐
              │ Fineract  │    │ Mock Rail  │   │ Event Bus  │
              │ Core/API  │    │ 模拟清算    │   │ ActiveMQ   │
              └─────┬─────┘    └────────────┘   └────────────┘
                    │
           ┌────────▼────────┐
           │ Core PostgreSQL │
           │ 禁止扩展服务写入 │
           └─────────────────┘

       ┌────────────────┐  ┌────────────────┐
       │ Channel DB     │  │ MailHog / SMS  │
       │ 独立 PostgreSQL│  │ 本地通知模拟    │
       └────────────────┘  └────────────────┘

       ┌────────────────────────────────────────────┐
       │ Prometheus / Grafana / Loki / OTel         │
       └────────────────────────────────────────────┘
```

### 4.1 服务职责

| 服务/模块 | 职责 | 禁止事项 |
|---|---|---|
| `gateway` | TLS、路由、限流、安全头、OIDC 前置校验 | 不保存业务数据 |
| `keycloak` | 客户和员工身份、MFA、会话、角色 | 不保存 Fineract 余额 |
| `bank-channel-service` | 客户隔离、支付编排、风险、通知、文档、对账 | 不直接写核心库 |
| `fineract-adapter` | 统一封装 Fineract API、租户、认证、幂等和错误映射 | 不暴露给浏览器 |
| `mock-clearing` | 模拟他行、成功、失败、超时、退回 | 不修改核心库 |
| `event-bus` | 异步事件和重试 | 不作为事实源 |
| `channel-postgres` | 渠道、支付、风险、通知、审计数据 | 不复制核心全量账务 |
| `customer-web` | 客户自助页面 | 不持久化 Token 到 localStorage |
| `ops-web` | 支付运营、告警、对账、人工审核 | 不替代 Mifos 员工后台 |

---

## 5. 仓库结构

在现有项目根目录中新增以下结构，不重排原有 Fineract 文件：

```text
mifos-isolated/
├─ compose.yaml                         # 现有或主编排文件
├─ compose.channel.yaml                 # 新增渠道扩展编排
├─ .env.example
├─ .gitignore
├─ docs/
│  ├─ architecture/
│  │  ├─ system-context.md
│  │  ├─ container-view.md
│  │  ├─ data-flow.md
│  │  └─ adr/
│  ├─ baseline/
│  │  ├─ runtime-inventory.md
│  │  ├─ container-inventory.json
│  │  ├─ fineract-version.json
│  │  ├─ swagger-original.json
│  │  ├─ feature-verification-matrix.md
│  │  └─ risk-register.md
│  ├─ runbooks/
│  │  ├─ start-stop.md
│  │  ├─ backup-restore.md
│  │  ├─ end-of-day.md
│  │  └─ incident-response.md
│  └─ test-evidence/
├─ contracts/
│  ├─ openapi/
│  │  ├─ customer-api.yaml
│  │  └─ operations-api.yaml
│  ├─ asyncapi/
│  │  └─ bank-events.yaml
│  ├─ schemas/
│  │  ├─ common/
│  │  ├─ payments/
│  │  ├─ risk/
│  │  └─ notifications/
│  └─ examples/
├─ services/
│  ├─ bank-channel-service/
│  └─ mock-clearing-service/
├─ apps/
│  ├─ customer-web/
│  └─ operations-web/
├─ infra/
│  ├─ gateway/
│  ├─ keycloak/
│  ├─ observability/
│  ├─ postgres/
│  ├─ activemq/
│  ├─ versions.lock.yaml
│  └─ images.lock.txt
├─ tests/
│  ├─ contract/
│  ├─ integration/
│  ├─ e2e/
│  ├─ security/
│  ├─ reconciliation/
│  └─ fixtures/
├─ scripts/
│  ├─ baseline/
│  ├─ dev/
│  ├─ test/
│  ├─ backup/
│  └─ seed/
└─ agent/
   ├─ AGENTS.md
   ├─ backlog.yaml
   ├─ execution-state.yaml
   └─ reports/
```

---

## 6. 网络、端口和部署约束

### 6.1 主机暴露端口

| 端口 | 服务 | 访问范围 |
|---:|---|---|
| 18080 | 现有 Mifos X Web | `127.0.0.1` |
| 13000 | 现有 Fineract API | `127.0.0.1`，后续可改为仅 Gateway/BFF 内部访问 |
| 18443 | 新 Gateway HTTPS | `127.0.0.1` |
| 18082 | Customer Web 开发服务器，仅开发模式 | `127.0.0.1` |
| 18083 | Operations Web 开发服务器，仅开发模式 | `127.0.0.1` |
| 19000 | Keycloak 管理与本地认证 | `127.0.0.1` |
| 18025 | MailHog Web | `127.0.0.1` |
| 19090 | Prometheus | `127.0.0.1` |
| 13001 | Grafana | `127.0.0.1` |

PostgreSQL、ActiveMQ、Loki、OTel Collector、Mock Clearing 的业务端口禁止映射到主机。

### 6.2 Docker 网络

```text
mifos-core-net        # 现有核心网络
bank-channel-net      # Gateway、BFF、Keycloak、Channel DB、Mock Clearing
bank-observability-net
```

连接规则：

- `bank-channel-service` 可加入 `mifos-core-net` 和 `bank-channel-net`。
- `gateway` 只加入 `bank-channel-net`。
- `channel-postgres` 只加入 `bank-channel-net`。
- 任何前端容器不得加入 `mifos-core-net`。
- 复用现有 ActiveMQ 前必须通过 ADR；不能安全复用则部署独立 Broker。

---

## 7. 基线审计 Agent

### 7.1 任务目标

在任何代码改动前，确认当前环境真实版本、容器、配置和可用接口，生成可复现基线。

### 7.2 必须执行的命令

PowerShell：

```powershell
Set-Location 'C:\Users\fujunye\Documents\实习\mifos-isolated'

docker compose config | Out-File -Encoding utf8 docs\baseline\compose-resolved.yaml
docker compose ps --format json | Out-File -Encoding utf8 docs\baseline\container-inventory.json
docker image ls --digests | Out-File -Encoding utf8 docs\baseline\images.txt
docker network ls | Out-File -Encoding utf8 docs\baseline\networks.txt
docker volume ls | Out-File -Encoding utf8 docs\baseline\volumes.txt

Invoke-WebRequest `
  -Uri 'http://127.0.0.1:13000/fineract-provider/swagger-ui/index.html' `
  -UseBasicParsing `
  -OutFile 'docs\baseline\swagger-ui.html'
```

Agent 必须从 Swagger UI 页面解析真实 OpenAPI 文档地址并保存为：

```text
docs/baseline/swagger-original.json
```

### 7.3 必须识别的信息

```yaml
fineract:
  image: null
  image_digest: null
  version: null
  git_sha: null
  java_version: null
  auth_mode: BASIC|OAUTH2
  idempotency_header: null
  external_events_enabled: false
  maker_checker_configured: false
  business_date_enabled: false
web_app:
  image: null
  version: null
postgres:
  image: null
  version: "18.3"
activemq:
  image: null
  version: null
  persistence_enabled: null
  dlq_configured: null
```

### 7.4 安全检查

Agent 必须检查但不得在报告中输出真实密钥：

- `.env` 是否提交 Git；
- 默认管理员口令是否仍在使用；
- API 是否允许无认证访问；
- 租户选择器和后端 URL 是否暴露；
- RBAC 前端开关是否开启；
- Fineract Basic 与 OAuth 是否错误同时启用；
- 数据库和 Broker 是否映射主机端口；
- Docker 镜像是否使用 `latest`；
- 是否存在明文数据库密码、JWT 密钥和管理员密码。

### 7.5 基线门禁

在以下条件满足前，禁止执行后续 Agent：

- 当前 Compose 可完整启动；
- `18080` 返回 HTTP 200；
- Fineract 健康检查正常；
- Swagger 已导出；
- 当前数据库已完成一次备份；
- `docker compose config` 无错误；
- 当前 Git 工作区已提交或生成快照标签。

建议标签：

```text
baseline/before-digital-bank-extension
```

---

## 8. 身份、授权和会话规范

### 8.1 Realm 划分

必须使用两个 Realm：

```text
bank-customer
bank-internal
```

客户身份和员工身份禁止放在同一 Realm。

### 8.2 OIDC 客户端

| Client ID | 类型 | 用途 |
|---|---|---|
| `customer-web` | Public + PKCE | 客户 SPA |
| `operations-web` | Public + PKCE | 运营 SPA |
| `bank-channel-service` | Confidential | BFF 服务账户 |
| `fineract-service` | Confidential | 仅在 Fineract OAuth 模式使用 |

客户 Web 必须使用 Authorization Code + PKCE。禁止使用 Implicit Flow，禁止把 Client Secret 放入前端。

### 8.3 Token 保存

优先采用 Backend-for-Frontend 会话 Cookie：

- Cookie：`HttpOnly`、`Secure`、`SameSite=Lax`；
- Access Token 不写入 `localStorage`；
- Refresh Token 不返回浏览器 JavaScript；
- 登出必须撤销服务端会话；
- 会话空闲超时默认 15 分钟；
- 绝对会话时长默认 8 小时。

### 8.4 角色

客户 Realm：

```text
CUSTOMER
CUSTOMER_MFA_VERIFIED
CUSTOMER_KYC_PENDING
CUSTOMER_KYC_APPROVED
CUSTOMER_BLOCKED
```

员工 Realm：

```text
TELLER
LOAN_OFFICER
LOAN_APPROVER
PAYMENT_OPERATOR
PAYMENT_APPROVER
AML_ANALYST
AUDITOR
SYSTEM_ADMIN
```

### 8.5 权限判断

所有客户查询必须同时满足：

```text
JWT subject -> customer_identity_link -> fineract_client_id
请求中的资源 -> 归属同一 fineract_client_id
租户 -> default 或授权租户
账户状态 -> 允许该操作
客户状态 -> 未冻结且 KYC 满足要求
```

禁止仅通过前端隐藏按钮实现授权。

### 8.6 MFA 与交易升级认证

以下操作必须要求近 5 分钟内完成 MFA：

- 新增或修改收款人；
- 首次向新收款人转账；
- 单笔金额超过 5000 CNY；
- 修改登录密码、手机号或邮箱；
- 导出包含完整敏感信息的文档；
- 关闭所有设备会话。

---

## 9. 通用 API 数据契约

### 9.1 请求头

| Header | 必填 | 说明 |
|---|---:|---|
| `Authorization` | 是 | Bearer Token 或 BFF Session |
| `X-Tenant-Id` | 是 | 当前固定 `default` |
| `X-Request-Id` | 否 | 缺失时 Gateway 生成 UUID |
| `traceparent` | 否 | 缺失时 Gateway 生成 |
| `Idempotency-Key` | 写操作按规则 | 客户生成的唯一键，最长 128 字符 |
| `Accept-Language` | 否 | 默认 `zh-CN` |

BFF 对 Fineract 调用时必须将标准 `Idempotency-Key` 映射为实际 Fineract 配置的幂等 Header。不得假设其拼写固定。

### 9.2 金额类型

禁止使用 JSON 浮点数表示金额。

```json
{
  "amount": "1250.00",
  "currency": "CNY"
}
```

规则：

- `amount` 为十进制字符串；
- CNY 默认 scale 为 2；
- 数据库存储使用 `NUMERIC(19, 2)`；
- Java 使用 `BigDecimal`；
- 比较金额前必须校验币种相同；
- 禁止在前端使用二进制浮点做最终金额计算。

### 9.3 成功响应

单资源直接返回资源对象，不额外包裹无意义的 `data`：

```json
{
  "id": "018f6f7e-2d61-7b7d-a74e-4f96fc38f701",
  "status": "SETTLED",
  "amount": "100.00",
  "currency": "CNY"
}
```

列表响应：

```json
{
  "items": [],
  "page": 0,
  "size": 20,
  "totalItems": 0,
  "totalPages": 0
}
```

### 9.4 错误响应

统一使用 Problem Details 风格：

```json
{
  "type": "urn:bank:error:insufficient-funds",
  "title": "账户可用余额不足",
  "status": 422,
  "detail": "账户可用余额不足以完成该笔转账",
  "instance": "/api/v1/transfers/018f6f7e-2d61-7b7d-a74e-4f96fc38f701",
  "code": "PAYMENT_INSUFFICIENT_FUNDS",
  "requestId": "8da90ec7-0a4f-4c1c-81e7-a4b8bb222165",
  "fieldErrors": []
}
```

### 9.5 HTTP 状态码

| 状态码 | 使用场景 |
|---:|---|
| 200 | 查询或同步更新成功 |
| 201 | 新资源创建成功 |
| 202 | 已受理，异步处理 |
| 204 | 删除或无返回更新成功 |
| 400 | 格式、字段、枚举错误 |
| 401 | 未认证 |
| 403 | 已认证但无权访问 |
| 404 | 资源不存在或不属于当前客户 |
| 409 | 幂等请求处理中、状态冲突、版本冲突 |
| 422 | 余额不足、业务规则不满足 |
| 429 | 限流 |
| 502 | Fineract 或外部模拟服务返回不可用响应 |
| 503 | 依赖服务不可用 |

### 9.6 幂等规范

以下接口必须要求 `Idempotency-Key`：

- 创建转账；
- 贷款还款；
- 贷款申请提交；
- 新增收款人；
- 冲正申请；
- 任何会产生资金或账务变化的操作。

幂等键作用域：

```text
tenant + authenticatedSubject + HTTP method + normalizedPath + idempotencyKey
```

同一作用域：

- 请求体哈希一致且已完成：返回原响应并设置 `X-Idempotent-Replay: true`；
- 请求体哈希不一致：返回 409；
- 原请求处理中：返回 409 和 `Retry-After`；
- 保留期：资金操作不少于 7 年的审计记录，在线幂等记录不少于 30 天。

---

## 10. 渠道数据库模型

### 10.1 数据库原则

- 所有表必须包含 `created_at`、`updated_at`。
- 时间戳使用 `TIMESTAMPTZ`，写入 UTC。
- 主键使用 UUID；禁止把 Fineract 自增 ID 暴露为客户侧主键。
- Fineract ID 仅存储在映射字段中。
- 所有资金状态表必须有乐观锁字段 `version`。
- PII 字段必须分类并按第 16 节脱敏或加密。
- Schema 变更只允许通过 Liquibase。

### 10.2 核心表 DDL

以下为逻辑基线，Agent 必须转写为 Liquibase changelog。

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE customer_identity_link (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           VARCHAR(64) NOT NULL,
    oidc_subject        VARCHAR(128) NOT NULL,
    fineract_client_id  BIGINT NOT NULL,
    customer_number     VARCHAR(64) NOT NULL,
    status              VARCHAR(32) NOT NULL,
    kyc_status          VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_identity_subject UNIQUE (tenant_id, oidc_subject),
    CONSTRAINT uq_identity_client UNIQUE (tenant_id, fineract_client_id)
);

CREATE TABLE beneficiary (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               VARCHAR(64) NOT NULL,
    owner_subject           VARCHAR(128) NOT NULL,
    name                    VARCHAR(140) NOT NULL,
    bank_code               VARCHAR(32) NOT NULL,
    bank_name               VARCHAR(140) NOT NULL,
    account_token           VARCHAR(256) NOT NULL,
    account_last4           CHAR(4) NOT NULL,
    account_name            VARCHAR(140) NOT NULL,
    beneficiary_type        VARCHAR(32) NOT NULL,
    status                  VARCHAR(32) NOT NULL,
    verified_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                 BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_beneficiary_owner ON beneficiary (tenant_id, owner_subject, status);

CREATE TABLE transfer_order (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               VARCHAR(64) NOT NULL,
    customer_subject        VARCHAR(128) NOT NULL,
    source_account_ref      UUID NOT NULL,
    source_fineract_id      BIGINT NOT NULL,
    beneficiary_id          UUID,
    destination_type        VARCHAR(32) NOT NULL,
    destination_ref         VARCHAR(128) NOT NULL,
    amount                  NUMERIC(19,2) NOT NULL CHECK (amount > 0),
    currency                CHAR(3) NOT NULL,
    purpose                 VARCHAR(140),
    status                  VARCHAR(32) NOT NULL,
    risk_decision           VARCHAR(32),
    clearing_reference      VARCHAR(128),
    fineract_transfer_id    BIGINT,
    failure_code            VARCHAR(64),
    failure_detail          VARCHAR(500),
    idempotency_key         VARCHAR(128) NOT NULL,
    request_hash            CHAR(64) NOT NULL,
    business_date           DATE NOT NULL,
    accepted_at             TIMESTAMPTZ,
    settled_at              TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                 BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_transfer_idempotency UNIQUE
      (tenant_id, customer_subject, idempotency_key)
);
CREATE INDEX idx_transfer_owner_time
  ON transfer_order (tenant_id, customer_subject, created_at DESC);
CREATE INDEX idx_transfer_status
  ON transfer_order (tenant_id, status, created_at);

CREATE TABLE transfer_state_history (
    id              BIGSERIAL PRIMARY KEY,
    transfer_id     UUID NOT NULL REFERENCES transfer_order(id),
    from_status     VARCHAR(32),
    to_status       VARCHAR(32) NOT NULL,
    reason_code     VARCHAR(64),
    actor_type      VARCHAR(32) NOT NULL,
    actor_id        VARCHAR(128) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transfer_history ON transfer_state_history (transfer_id, created_at);

CREATE TABLE channel_reservation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id         UUID NOT NULL UNIQUE REFERENCES transfer_order(id),
    tenant_id           VARCHAR(64) NOT NULL,
    source_fineract_id  BIGINT NOT NULL,
    amount              NUMERIC(19,2) NOT NULL CHECK (amount > 0),
    currency            CHAR(3) NOT NULL,
    status              VARCHAR(32) NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_reservation_account
  ON channel_reservation (tenant_id, source_fineract_id, status, expires_at);

CREATE TABLE risk_assessment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id         UUID REFERENCES transfer_order(id),
    customer_subject    VARCHAR(128) NOT NULL,
    assessment_type     VARCHAR(32) NOT NULL,
    score               INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    decision            VARCHAR(32) NOT NULL,
    triggered_rules     JSONB NOT NULL,
    input_snapshot      JSONB NOT NULL,
    model_version       VARCHAR(64) NOT NULL,
    reviewed_by         VARCHAR(128),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE idempotency_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_key           VARCHAR(512) NOT NULL UNIQUE,
    request_hash        CHAR(64) NOT NULL,
    status              VARCHAR(32) NOT NULL,
    http_status         INTEGER,
    response_headers    JSONB,
    response_body       JSONB,
    resource_id         UUID,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE outbox_event (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type      VARCHAR(64) NOT NULL,
    aggregate_id        UUID NOT NULL,
    event_type          VARCHAR(160) NOT NULL,
    event_version       INTEGER NOT NULL,
    payload             JSONB NOT NULL,
    headers             JSONB NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_dispatch
  ON outbox_event (status, next_attempt_at, created_at);

CREATE TABLE inbox_event (
    event_id            UUID PRIMARY KEY,
    event_type          VARCHAR(160) NOT NULL,
    payload_hash        CHAR(64) NOT NULL,
    processing_status   VARCHAR(32) NOT NULL,
    processed_at        TIMESTAMPTZ,
    failure_detail      VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_subject    VARCHAR(128) NOT NULL,
    channel             VARCHAR(32) NOT NULL,
    template_code       VARCHAR(64) NOT NULL,
    destination_masked  VARCHAR(160),
    variables           JSONB NOT NULL,
    status              VARCHAR(32) NOT NULL,
    provider_message_id VARCHAR(128),
    failure_detail      VARCHAR(500),
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE document_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_subject    VARCHAR(128) NOT NULL,
    document_type       VARCHAR(64) NOT NULL,
    business_reference  VARCHAR(128) NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(128) NOT NULL,
    storage_key         VARCHAR(512) NOT NULL,
    sha256              CHAR(64) NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_batch (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_type          VARCHAR(64) NOT NULL,
    business_date       DATE NOT NULL,
    status              VARCHAR(32) NOT NULL,
    source_count        INTEGER NOT NULL DEFAULT 0,
    source_amount       NUMERIC(19,2) NOT NULL DEFAULT 0,
    target_count        INTEGER NOT NULL DEFAULT 0,
    target_amount       NUMERIC(19,2) NOT NULL DEFAULT 0,
    difference_count    INTEGER NOT NULL DEFAULT 0,
    difference_amount   NUMERIC(19,2) NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_recon_batch UNIQUE (batch_type, business_date)
);

CREATE TABLE reconciliation_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID NOT NULL REFERENCES reconciliation_batch(id),
    business_reference  VARCHAR(128) NOT NULL,
    source_status       VARCHAR(32),
    target_status       VARCHAR(32),
    source_amount       NUMERIC(19,2),
    target_amount       NUMERIC(19,2),
    difference_type     VARCHAR(64),
    resolution_status   VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    resolution_note     VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE security_audit_event (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type          VARCHAR(128) NOT NULL,
    actor_type          VARCHAR(32) NOT NULL,
    actor_id            VARCHAR(128) NOT NULL,
    tenant_id           VARCHAR(64) NOT NULL,
    resource_type       VARCHAR(64),
    resource_id         VARCHAR(128),
    action              VARCHAR(64) NOT NULL,
    outcome             VARCHAR(32) NOT NULL,
    request_id          VARCHAR(128),
    trace_id            VARCHAR(64),
    ip_address_hash     CHAR(64),
    user_agent_hash     CHAR(64),
    details             JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash       CHAR(64),
    record_hash         CHAR(64) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 10.3 状态枚举

数据库状态必须通过应用层枚举和数据库 CHECK 约束共同控制。

```text
CustomerLinkStatus: ACTIVE, SUSPENDED, CLOSED
KycStatus: PENDING, IN_REVIEW, APPROVED, REJECTED, EXPIRED
BeneficiaryStatus: PENDING_VERIFICATION, ACTIVE, SUSPENDED, DELETED
TransferStatus:
  CREATED
  RISK_PENDING
  REVIEW_REQUIRED
  APPROVED
  RESERVED
  SUBMITTED
  SETTLED
  FAILED
  TIMED_OUT
  RETURNED
  REVERSAL_PENDING
  REVERSED
RiskDecision: ALLOW, REVIEW, BLOCK
ReservationStatus: ACTIVE, CONSUMED, RELEASED, EXPIRED
NotificationStatus: PENDING, SENT, FAILED, SUPPRESSED
ReconciliationStatus: CREATED, RUNNING, MATCHED, DIFFERENCE_FOUND, FAILED
```

---

## 11. Customer API 契约

### 11.1 API 根路径

```text
/api/v1
```

### 11.2 端点清单

| 方法 | 路径 | 说明 | 幂等键 |
|---|---|---|---:|
| GET | `/me` | 当前客户资料 | 否 |
| GET | `/accounts` | 当前客户账户列表 | 否 |
| GET | `/accounts/{accountId}` | 账户详情 | 否 |
| GET | `/accounts/{accountId}/transactions` | 流水 | 否 |
| GET | `/loans` | 贷款列表 | 否 |
| GET | `/loans/{loanId}` | 贷款详情 | 否 |
| GET | `/loans/{loanId}/schedule` | 还款计划 | 否 |
| GET | `/beneficiaries` | 收款人列表 | 否 |
| POST | `/beneficiaries` | 新增收款人 | 是 |
| PATCH | `/beneficiaries/{id}` | 修改收款人 | 是 |
| DELETE | `/beneficiaries/{id}` | 删除收款人 | 是 |
| POST | `/transfers/quote` | 转账预检和费用试算 | 否 |
| POST | `/transfers` | 创建转账 | 是 |
| GET | `/transfers/{id}` | 转账详情 | 否 |
| GET | `/transfers` | 转账列表 | 否 |
| POST | `/transfers/{id}/cancel` | 取消未提交交易 | 是 |
| POST | `/transfers/{id}/mfa/verify` | 验证交易 MFA | 是 |
| GET | `/documents` | 文档列表 | 否 |
| POST | `/documents/statements` | 生成对账单 | 是 |
| GET | `/documents/{id}/content` | 下载文档 | 否 |
| GET | `/notifications` | 站内消息 | 否 |
| POST | `/sessions/logout-all` | 注销全部会话 | 是 |

### 11.3 账户统一模型

```json
{
  "id": "018f7120-e65d-7906-8555-9af94990f667",
  "type": "SAVINGS",
  "productName": "人民币活期储蓄",
  "accountNumberMasked": "******1234",
  "currency": "CNY",
  "ledgerBalance": "10000.00",
  "reservedAmount": "500.00",
  "availableBalance": "9500.00",
  "status": "ACTIVE",
  "fineractStatus": "ACTIVE",
  "openedOn": "2026-07-10"
}
```

`availableBalance` 计算规则：

```text
availableBalance = Fineract available balance - 有效渠道预留金额
```

P0 阶段的渠道预留只能阻止客户网页端重复消费，不能阻止 Mifos 柜面同时取款。该限制必须显示在风险登记中。P1 阶段应验证并接入 Fineract 原生金额冻结、留置或等价能力。

### 11.4 创建转账请求

```json
{
  "sourceAccountId": "018f7120-e65d-7906-8555-9af94990f667",
  "destination": {
    "type": "BENEFICIARY",
    "beneficiaryId": "018f7130-2f5f-7551-9917-22609eeb10be"
  },
  "amount": "100.00",
  "currency": "CNY",
  "purpose": "生活费",
  "clientReference": "WEB-20260710-000001"
}
```

响应：

```json
{
  "id": "018f7149-4b56-730a-97f1-9a8514123a9e",
  "status": "RISK_PENDING",
  "amount": "100.00",
  "currency": "CNY",
  "sourceAccountId": "018f7120-e65d-7906-8555-9af94990f667",
  "beneficiaryId": "018f7130-2f5f-7551-9917-22609eeb10be",
  "requiresMfa": false,
  "createdAt": "2026-07-10T03:30:00Z",
  "links": {
    "self": "/api/v1/transfers/018f7149-4b56-730a-97f1-9a8514123a9e"
  }
}
```

### 11.5 OpenAPI 关键片段

实际文件必须保存为 `contracts/openapi/customer-api.yaml`，并通过 Spectral 或等价工具检查。

```yaml
openapi: 3.1.1
info:
  title: Local Digital Bank Customer API
  version: 1.0.0
jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema
servers:
  - url: https://127.0.0.1:18443/api/v1
security:
  - oidc: [customer]
paths:
  /transfers:
    post:
      operationId: createTransfer
      summary: 创建转账
      parameters:
        - $ref: '#/components/parameters/TenantId'
        - $ref: '#/components/parameters/IdempotencyKey'
        - $ref: '#/components/parameters/RequestId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTransferRequest'
      responses:
        '201':
          description: 转账订单已创建
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Transfer'
        '409':
          $ref: '#/components/responses/Conflict'
        '422':
          $ref: '#/components/responses/Unprocessable'
components:
  parameters:
    TenantId:
      name: X-Tenant-Id
      in: header
      required: true
      schema:
        type: string
        const: default
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema:
        type: string
        minLength: 8
        maxLength: 128
    RequestId:
      name: X-Request-Id
      in: header
      required: false
      schema:
        type: string
        format: uuid
  schemas:
    Money:
      type: object
      required: [amount, currency]
      properties:
        amount:
          type: string
          pattern: '^(0|[1-9][0-9]{0,16})\\.[0-9]{2}$'
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
      additionalProperties: false
    CreateTransferRequest:
      type: object
      required: [sourceAccountId, destination, amount, currency]
      properties:
        sourceAccountId:
          type: string
          format: uuid
        destination:
          $ref: '#/components/schemas/TransferDestination'
        amount:
          type: string
          pattern: '^[1-9][0-9]{0,16}\\.[0-9]{2}$'
        currency:
          type: string
          const: CNY
        purpose:
          type: string
          maxLength: 140
        clientReference:
          type: string
          maxLength: 64
      additionalProperties: false
    TransferDestination:
      oneOf:
        - type: object
          required: [type, beneficiaryId]
          properties:
            type:
              const: BENEFICIARY
            beneficiaryId:
              type: string
              format: uuid
          additionalProperties: false
        - type: object
          required: [type, ownAccountId]
          properties:
            type:
              const: OWN_ACCOUNT
            ownAccountId:
              type: string
              format: uuid
          additionalProperties: false
```

---

## 12. Fineract Adapter 契约

### 12.1 适配器职责

`fineract-adapter` 必须集中处理：

- API Base URL；
- `/fineract-provider/api/v1` 前缀；
- `Fineract-Platform-TenantId` 或当前实例实际租户 Header；
- Basic 或 OAuth2 服务认证；
- Fineract 幂等 Header 映射；
- 日期格式和 `locale`；
- Fineract 错误转 Problem Details；
- 超时、熔断、日志脱敏和 Trace ID；
- Fineract 自增 ID 与渠道 UUID 的映射。

### 12.2 禁止规则

- 禁止在 Controller 中直接拼接 Fineract URL。
- 禁止在多个模块复制认证 Header 代码。
- 禁止对资金类 POST 进行无幂等键自动重试。
- 禁止把 Fineract 原始错误完整返回浏览器。
- 禁止把服务账户凭据写入日志。

### 12.3 API 映射基线

Agent 必须以本地 Swagger 为准确认路径，以下只作为目标映射：

| 渠道能力 | Fineract 能力候选 |
|---|---|
| 当前客户账户 | Clients/Accounts、Savings Accounts、Loans 查询 |
| 储蓄详情 | `GET /savingsaccounts/{id}` |
| 储蓄流水 | 储蓄账户详情关联交易或交易查询接口 |
| 本行账户转账 | Account Transfers |
| 贷款详情 | `GET /loans/{id}` |
| 贷款还款 | Loan transaction repayment command |
| 客户文档 | Documents API 或独立文档服务 |
| 审计 | Audit/Commands API |
| Maker-Checker | Maker-Checker 配置和待审批命令 API |

### 12.4 调用策略

```yaml
fineractClient:
  connectTimeoutMs: 2000
  readTimeoutMs: 8000
  maxConnections: 50
  retry:
    GET:
      maxAttempts: 3
      backoffMs: [100, 300, 900]
    POST:
      maxAttempts: 1
      retryOnlyWithSameIdempotencyKey: true
  circuitBreaker:
    failureRateThreshold: 50
    slidingWindowSize: 20
    openStateSeconds: 30
```

### 12.5 错误映射

| Fineract 情况 | 渠道错误码 |
|---|---|
| 认证失败 | `CORE_AUTH_FAILED` |
| 租户无效 | `CORE_TENANT_INVALID` |
| 资源不存在 | `RESOURCE_NOT_FOUND` |
| 数据校验失败 | `CORE_VALIDATION_FAILED` |
| 余额不足 | `PAYMENT_INSUFFICIENT_FUNDS` |
| 命令处理中幂等冲突 | `IDEMPOTENCY_IN_PROGRESS` |
| 依赖超时 | `CORE_TIMEOUT` |
| 未知 5xx | `CORE_UNAVAILABLE` |

---

## 13. 支付状态机与资金流程

### 13.1 状态转换

```text
CREATED
  -> RISK_PENDING
RISK_PENDING
  -> APPROVED
  -> REVIEW_REQUIRED
  -> FAILED
REVIEW_REQUIRED
  -> APPROVED
  -> FAILED
APPROVED
  -> RESERVED
  -> FAILED
RESERVED
  -> SUBMITTED
  -> FAILED
SUBMITTED
  -> SETTLED
  -> TIMED_OUT
  -> FAILED
TIMED_OUT
  -> SETTLED
  -> FAILED
  -> RETURNED
SETTLED
  -> RETURNED
  -> REVERSAL_PENDING
RETURNED
  -> REVERSAL_PENDING
REVERSAL_PENDING
  -> REVERSED
```

任何未在图中声明的转换必须返回 409。

### 13.2 转账类型

```text
OWN_ACCOUNT      客户本人账户之间
INTERNAL         本行不同客户账户之间
EXTERNAL_MOCK    模拟跨行
LOAN_REPAYMENT   贷款还款
```

### 13.3 P0 本行转账流程

```text
1. 验证客户、账户归属、账户状态、币种和限额
2. 创建 transfer_order=CREATED
3. 风险评估 -> ALLOW/REVIEW/BLOCK
4. 计算渠道有效预留并验证可用余额
5. 写 channel_reservation=ACTIVE
6. 使用固定幂等键调用 Fineract Account Transfer
7. Fineract 成功：reservation=CONSUMED，transfer=SETTLED
8. 写 Outbox Event
9. 生成通知和回单
10. 对账任务核对 transfer_order 与 Fineract transfer/transaction
```

### 13.4 P0 模拟跨行流程

```text
1. 完成风险和预留
2. transfer=SUBMITTED
3. 调用 mock-clearing
4. mock-clearing 根据测试场景返回：
   - ACCEPTED + 延迟结算
   - REJECTED
   - TIMEOUT
   - SETTLED
5. 只有收到 SETTLED 后才调用 Fineract 完成最终扣账
6. Fineract 成功后 transfer=SETTLED
7. 若 Fineract 失败，进入运营人工处理队列，不得伪造结算成功
8. 模拟清算已成功但核心未记账的差异必须被对账发现
```

P0 采用“清算成功后核心扣账”，以避免没有核心冻结能力时长时间挂账。P1 必须评估并实现核心金额冻结、留置账户或清算中间账户方案。

### 13.5 Mock Clearing 请求

```json
{
  "messageId": "018f7198-3cf4-7d88-b904-8617c0d0af81",
  "transferId": "018f7149-4b56-730a-97f1-9a8514123a9e",
  "debtorBank": "LOCALBANK",
  "creditorBank": "MOCK001",
  "creditorAccountToken": "tok_acc_xxx",
  "creditorAccountName": "张三",
  "amount": "100.00",
  "currency": "CNY",
  "requestedExecutionDate": "2026-07-10",
  "scenario": "AUTO"
}
```

响应：

```json
{
  "messageId": "018f7198-3cf4-7d88-b904-8617c0d0af81",
  "clearingReference": "CLR-20260710-00000001",
  "status": "ACCEPTED",
  "estimatedSettlementAt": "2026-07-10T03:31:00Z"
}
```

### 13.6 Mock 场景控制

仅测试和运营角色可指定：

```text
AUTO
SUCCESS_IMMEDIATE
SUCCESS_DELAYED
REJECT_ACCOUNT_INVALID
REJECT_BANK_UNAVAILABLE
TIMEOUT_THEN_SUCCESS
TIMEOUT_THEN_FAIL
RETURN_AFTER_SETTLEMENT
DUPLICATE_CALLBACK
OUT_OF_ORDER_CALLBACK
```

客户 API 禁止直接传入测试场景。

### 13.7 转账限额

默认本地规则：

```yaml
limits:
  ownAccount:
    perTransaction: "1000000.00"
    daily: "5000000.00"
  internal:
    perTransaction: "50000.00"
    daily: "100000.00"
  externalMock:
    perTransaction: "20000.00"
    daily: "50000.00"
  newBeneficiaryFirst24Hours:
    perTransaction: "5000.00"
    daily: "5000.00"
```

限额必须配置化，不得硬编码在 Controller。

---

## 14. 事件契约

### 14.1 事件命名

```text
cn.localbank.customer.created.v1
cn.localbank.payment.transfer.created.v1
cn.localbank.payment.risk.decisioned.v1
cn.localbank.payment.transfer.submitted.v1
cn.localbank.payment.transfer.settled.v1
cn.localbank.payment.transfer.failed.v1
cn.localbank.payment.transfer.returned.v1
cn.localbank.payment.transfer.reversed.v1
cn.localbank.notification.requested.v1
cn.localbank.reconciliation.difference-found.v1
```

破坏性数据结构变化必须升级末尾主版本。

### 14.2 CloudEvents Envelope

```json
{
  "specversion": "1.0",
  "id": "018f71c2-fad8-7bb1-a488-11d6f0a82a0e",
  "source": "/bank-channel-service/payments",
  "type": "cn.localbank.payment.transfer.settled.v1",
  "subject": "transfer/018f7149-4b56-730a-97f1-9a8514123a9e",
  "time": "2026-07-10T03:31:01Z",
  "datacontenttype": "application/json",
  "dataschema": "urn:schema:payments:transfer-settled:1",
  "tenantid": "default",
  "correlationid": "8da90ec7-0a4f-4c1c-81e7-a4b8bb222165",
  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "data": {
    "transferId": "018f7149-4b56-730a-97f1-9a8514123a9e",
    "amount": "100.00",
    "currency": "CNY",
    "businessDate": "2026-07-10",
    "fineractTransferId": 12345,
    "clearingReference": "CLR-20260710-00000001"
  }
}
```

### 14.3 事件投递规则

- 使用 Transactional Outbox。
- 业务状态更新和 Outbox 插入必须在同一数据库事务。
- 消费者使用 Inbox 表去重。
- 投递语义为 at-least-once；消费者必须幂等。
- 事件顺序只保证同一 `aggregateId` 内按 `aggregateVersion` 检查。
- 失败重试：1 分钟、5 分钟、30 分钟、2 小时、6 小时。
- 超过最大次数进入 DLQ，并触发告警。
- 禁止把密码、完整证件号、完整银行卡号写入事件。

### 14.4 AsyncAPI 骨架

```yaml
asyncapi: 3.1.0
info:
  title: Local Digital Bank Events
  version: 1.0.0
channels:
  paymentEvents:
    address: bank.payment.events.v1
    messages:
      transferSettled:
        $ref: '#/components/messages/TransferSettled'
operations:
  publishTransferSettled:
    action: send
    channel:
      $ref: '#/channels/paymentEvents'
    messages:
      - $ref: '#/channels/paymentEvents/messages/transferSettled'
components:
  messages:
    TransferSettled:
      name: TransferSettled
      contentType: application/cloudevents+json
      payload:
        $ref: '../schemas/payments/transfer-settled.schema.json'
```

---

## 15. KYC、AML 与欺诈模拟

### 15.1 风险服务输入契约

```json
{
  "assessmentType": "TRANSFER",
  "customer": {
    "subject": "0b6f3f6c-3a51-49c9-9efe-b91324613499",
    "kycStatus": "APPROVED",
    "customerSince": "2026-01-01",
    "riskLevel": "MEDIUM"
  },
  "transaction": {
    "transferId": "018f7149-4b56-730a-97f1-9a8514123a9e",
    "amount": "10000.00",
    "currency": "CNY",
    "destinationBank": "MOCK001",
    "beneficiaryAgeHours": 1,
    "localHour": 3
  },
  "signals": {
    "newDevice": true,
    "failedLoginCount24h": 2,
    "transferCount1h": 4,
    "transferAmount24h": "15000.00",
    "ipRisk": "LOW"
  }
}
```

### 15.2 风险输出契约

```json
{
  "assessmentId": "018f71f4-79fb-7def-a949-83efdf531754",
  "decision": "REVIEW",
  "score": 76,
  "triggeredRules": [
    {
      "code": "NEW_BENEFICIARY_HIGH_AMOUNT",
      "score": 35,
      "reason": "新收款人 24 小时内转账金额超过限制"
    },
    {
      "code": "NEW_DEVICE",
      "score": 20,
      "reason": "当前设备首次使用"
    }
  ],
  "modelVersion": "rules-1.0.0",
  "expiresAt": "2026-07-10T03:35:00Z"
}
```

### 15.3 P0 规则集

| 规则码 | 条件 | 分值/决策 |
|---|---|---|
| `KYC_NOT_APPROVED` | KYC 非 APPROVED | BLOCK |
| `CUSTOMER_BLOCKED` | 客户冻结 | BLOCK |
| `BENEFICIARY_BLACKLISTED` | 收款人命中黑名单 | BLOCK |
| `AMOUNT_OVER_LIMIT` | 超过单笔或单日限额 | BLOCK |
| `NEW_BENEFICIARY_HIGH_AMOUNT` | 新收款人 24h 内金额 > 5000 | +35 |
| `NEW_DEVICE` | 新设备 | +20 |
| `NIGHT_HIGH_AMOUNT` | 00:00-05:00 且金额 > 5000 | +20 |
| `HIGH_FREQUENCY` | 1h 内转账次数 >= 5 | +25 |
| `STRUCTURING_PATTERN` | 多笔金额接近阈值 | +30 |
| `FAILED_LOGIN_CORRELATION` | 24h 登录失败 >= 5 | +30 |

决策阈值：

```text
0-39    ALLOW
40-69   ALLOW + MFA
70-89   REVIEW
90-100  BLOCK
```

BLOCK 规则优先于分数。

### 15.4 KYC 模拟状态机

```text
PENDING -> IN_REVIEW -> APPROVED
PENDING -> IN_REVIEW -> REJECTED
APPROVED -> EXPIRED -> IN_REVIEW
APPROVED -> SUSPENDED
```

模拟 KYC 数据至少包括：

- 姓名；
- 证件类型；
- 证件号 Token 和后四位；
- 证件有效期；
- 手机号 Token 和掩码；
- 地址；
- 风险等级；
- 审核结果；
- 审核人和审核时间。

禁止保存真实个人证件数据作为演示种子。测试数据必须明显为虚构数据。

### 15.5 AML 案件

P1 新增：

```text
aml_alert
aml_case
aml_case_activity
watchlist_entry
```

告警必须支持：

```text
OPEN -> ASSIGNED -> INVESTIGATING -> ESCALATED -> CLOSED_FALSE_POSITIVE
                                          -> CLOSED_CONFIRMED
```

---

## 16. 安全与隐私规范

### 16.1 数据分类

| 等级 | 示例 | 处理要求 |
|---|---|---|
| PUBLIC | 产品名称、公开费率 | 普通存储 |
| INTERNAL | 服务配置、非敏感日志 | 权限控制 |
| CONFIDENTIAL | 客户姓名、联系方式 | 加密、脱敏、审计 |
| RESTRICTED | 密码、Token、完整证件号 | 禁止日志、强加密、最小访问 |

### 16.2 PII 处理

- 完整账户号不得返回前端；使用渠道 UUID 和掩码。
- 数据库不得明文保存外部收款账户号；保存 Token、后四位和受控加密值。
- 日志必须将手机号、邮箱、账户号、证件号脱敏。
- 密码、Access Token、Refresh Token、Client Secret 禁止进入日志、事件或错误响应。
- 文档下载必须校验资源归属并记录审计事件。

### 16.3 密钥

本地开发可使用 Docker Secret 或未提交的 `.env.local`。仓库只能包含：

```text
.env.example
```

必须在 `.gitignore` 中忽略：

```gitignore
.env
.env.*.local
secrets/
backups/
infra/keycloak/export/*.secret.json
```

### 16.4 Gateway 安全头

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy
Strict-Transport-Security（仅 HTTPS）
```

### 16.5 限流

默认：

```yaml
rateLimits:
  login:
    anonymousPerIpPerMinute: 10
  customerRead:
    perSubjectPerMinute: 120
  transferQuote:
    perSubjectPerMinute: 20
  transferCreate:
    perSubjectPerMinute: 10
  mfaVerify:
    perSubjectPerFiveMinutes: 5
  documentGenerate:
    perSubjectPerHour: 10
```

### 16.6 审计防篡改

`security_audit_event.record_hash`：

```text
SHA-256(previous_hash + canonical_json(current_record_without_hash))
```

每天生成链尾哈希并保存到只读文件：

```text
audit-checkpoints/YYYY-MM-DD.sha256
```

---

## 17. Maker-Checker 和运营后台

### 17.1 受控操作矩阵

| 操作 | 经办角色 | 复核角色 | 同人复核 |
|---|---|---|---:|
| 金融产品新增/修改 | SYSTEM_ADMIN | SYSTEM_ADMIN | 禁止 |
| 大额转账人工放行 | PAYMENT_OPERATOR | PAYMENT_APPROVER | 禁止 |
| 手工总账分录 | ACCOUNTING_OPERATOR | ACCOUNTING_APPROVER | 禁止 |
| 贷款审批 | LOAN_OFFICER | LOAN_APPROVER | 禁止 |
| 贷款核销 | LOAN_OFFICER | LOAN_APPROVER | 禁止 |
| 交易冲正 | PAYMENT_OPERATOR | PAYMENT_APPROVER | 禁止 |
| KYC 高风险通过 | AML_ANALYST | AML_APPROVER | 禁止 |
| 用户角色变更 | SYSTEM_ADMIN | SECURITY_ADMIN | 禁止 |

### 17.2 审批状态

```text
DRAFT -> SUBMITTED -> APPROVED -> EXECUTED
                   -> REJECTED
                   -> CANCELLED
```

### 17.3 与 Fineract Maker-Checker 的关系

- Fineract 已支持细粒度 Maker-Checker 的操作，优先使用 Fineract 原生能力。
- 渠道支付和风险人工审核使用渠道 `approval_request` 模型。
- 不允许同时存在两个互不感知的审批最终状态。
- 若操作最终由 Fineract 执行，渠道审批通过后仍需确认 Fineract 命令的最终状态。

### 17.4 运营 API

```text
GET  /ops/v1/transfers?status=REVIEW_REQUIRED
GET  /ops/v1/transfers/{id}
POST /ops/v1/transfers/{id}/approve
POST /ops/v1/transfers/{id}/reject
GET  /ops/v1/reconciliations
GET  /ops/v1/reconciliations/{id}/items
POST /ops/v1/reconciliations/{id}/items/{itemId}/resolve
GET  /ops/v1/dead-letters
POST /ops/v1/dead-letters/{id}/replay
GET  /ops/v1/audit-events
```

审批接口必须要求：

- `Idempotency-Key`；
- 明确审批意见；
- 当前用户不是创建者；
- 用户具备 Checker 权限；
- 请求版本与当前资源版本一致。

---

## 18. 通知、文档和电子回单

### 18.1 通知渠道

P0：

- 站内信；
- MailHog 邮件；
- 本地 SMS Stub。

### 18.2 通知模板

```text
LOGIN_NEW_DEVICE
LOGIN_FAILED_LOCKED
BENEFICIARY_ADDED
TRANSFER_SUBMITTED
TRANSFER_SETTLED
TRANSFER_FAILED
TRANSFER_RETURNED
LOAN_PAYMENT_DUE
LOAN_PAYMENT_RECEIVED
STATEMENT_READY
```

模板变量必须通过 Schema 校验。禁止在模板中直接使用未转义 HTML。

### 18.3 电子回单

转账结算后生成 PDF，至少包含：

- 银行沙箱标识；
- 回单编号；
- 交易编号；
- 交易时间和业务日期；
- 付款账户掩码；
- 收款账户掩码；
- 收款行；
- 金额和币种；
- 用途；
- 状态；
- 核心交易引用；
- 清算引用；
- SHA-256 校验值；
- “仅用于本地测试，不代表真实资金凭证”水印。

### 18.4 对账单

- 月度或指定日期范围；
- 余额、可用余额、交易明细；
- 期初余额 + 收入 - 支出 = 期末余额；
- PDF 和 CSV；
- 生成任务必须幂等；
- 文件存储默认使用本地绑定卷，接口只返回受控下载流。

---

## 19. 对账与会计校验

### 19.1 对账类型

```text
CHANNEL_TO_CORE
CHANNEL_TO_CLEARING
CORE_TO_GENERAL_LEDGER
DOCUMENT_TO_TRANSACTION
```

### 19.2 CHANNEL_TO_CORE

逐笔核对：

```text
transfer_order.status = SETTLED
必须存在 fineract_transfer_id 或 fineract_transaction_id
金额和币种一致
客户源账户一致
核心交易未撤销
核心只存在一笔对应交易
```

### 19.3 CHANNEL_TO_CLEARING

逐笔核对：

```text
SUBMITTED/SETTLED/FAILED/RETURNED 状态对应
clearing_reference 唯一
金额、币种一致
重复回调未形成重复订单
清算成功但核心失败必须标记差异
```

### 19.4 会计不变量

Agent 必须通过 Fineract 报表或总账接口验证：

```text
每个 Journal Entry 交易借方合计 = 贷方合计
储蓄账户余额合计与控制科目余额一致
贷款本金余额合计与贷款资产控制科目一致
冲正前后净影响为 0
```

### 19.5 对账任务

```yaml
jobs:
  channelToCore:
    cron: "0 */10 * * * *"
  channelToClearing:
    cron: "30 */10 * * * *"
  dailySummary:
    cron: "0 30 23 * * *"
  auditCheckpoint:
    cron: "0 50 23 * * *"
```

测试环境必须支持手动 API 触发，不依赖等待真实时间。

---

## 20. 日终和业务日期

### 20.1 日终顺序

```text
1. 锁定业务日期变更
2. 检查未完成资金交易
3. 执行渠道与清算对账
4. 执行渠道与核心对账
5. 执行 Fineract COB/批任务
6. 利息、费用、逾期更新
7. 执行会计平衡检查
8. 生成日终汇总和异常报告
9. 生成审计链检查点
10. 推进业务日期
11. 解锁下一营业日
```

### 20.2 日终失败

任一步失败：

- 不得推进业务日期；
- 记录失败步骤和可重试信息；
- 发送运营告警；
- 重跑必须幂等；
- 禁止通过直接改数据库绕过。

### 20.3 时间旅行测试

测试脚本应支持：

```powershell
.\scripts\test\set-business-date.ps1 -Date '2026-07-31'
.\scripts\test\run-eod.ps1
.\scripts\test\assert-business-date.ps1 -ExpectedDate '2026-08-01'
```

具体 Fineract 业务日期 API 必须由基线 Agent 从本地 Swagger 确认。

---

## 21. 可观测性

### 21.1 日志格式

所有后端服务输出 JSON：

```json
{
  "timestamp": "2026-07-10T03:31:01.231Z",
  "level": "INFO",
  "service": "bank-channel-service",
  "environment": "local",
  "tenantId": "default",
  "requestId": "8da90ec7-0a4f-4c1c-81e7-a4b8bb222165",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "event": "transfer.settled",
  "resourceId": "018f7149-4b56-730a-97f1-9a8514123a9e",
  "durationMs": 245,
  "outcome": "SUCCESS"
}
```

禁止记录请求完整 Authorization Header 和完整 PII。

### 21.2 指标

至少暴露：

```text
bank_http_requests_total
bank_http_request_duration_seconds
bank_fineract_calls_total
bank_fineract_call_duration_seconds
bank_transfers_total{type,status}
bank_transfer_processing_seconds{type}
bank_risk_decisions_total{decision,rule}
bank_outbox_pending_total
bank_outbox_publish_failures_total
bank_dlq_messages_total
bank_reconciliation_differences_total{type}
bank_notifications_total{channel,status}
bank_eod_status
```

### 21.3 告警

| 告警 | 条件 |
|---|---|
| Core unavailable | Fineract 连续 1 分钟调用失败率 > 50% |
| Payment backlog | SUBMITTED 超过 5 分钟数量 > 0 |
| Outbox backlog | PENDING 超过 100 或最老消息 > 5 分钟 |
| Reconciliation difference | 差异数 > 0 |
| EOD failed | 日终状态 FAILED |
| DLQ non-empty | DLQ 消息数 > 0 |
| Authentication attack | 单 IP 登录失败过高 |

---

## 22. 备份与恢复

### 22.1 备份对象

- `fineract_tenants`；
- `fineract_default`；
- `bank_channel`；
- Keycloak Realm 导出；
- 文档存储卷；
- Compose、锁定版本、Liquibase changelog；
- Gateway、监控和告警配置。

### 22.2 备份规则

- 备份文件不提交 Git；
- 备份包含 SHA-256；
- 文件名包含 UTC 时间；
- 恢复脚本必须要求显式环境名；
- 禁止恢复脚本默认覆盖当前数据。

### 22.3 恢复演练

```text
1. 创建指定测试客户、账户和转账
2. 记录余额、交易数、会计分录数和审计链尾哈希
3. 执行备份
4. 删除测试环境容器和数据卷
5. 重建空环境
6. 恢复数据库、Keycloak 和文档
7. 重新执行记录校验
8. 生成 docs/test-evidence/restore-drill-YYYYMMDD.md
```

---

## 23. 自动化测试规范

### 23.1 测试层级

| 层级 | 工具 | 门禁 |
|---|---|---|
| Unit | JUnit 5、Vitest | 每次提交 |
| Architecture | ArchUnit | 每次提交 |
| Schema | JSON Schema Validator | 每次提交 |
| OpenAPI | Spectral、OpenAPI parser | 每次提交 |
| Contract | Spring MockMvc/REST Assured、Pact 可选 | PR |
| Integration | Testcontainers | PR |
| Fineract integration | 本地隔离实例 | 合并前 |
| E2E | Playwright | 合并前 |
| Security | OWASP ZAP Baseline、依赖扫描 | 发布前 |
| Reconciliation | SQL/API 断言 | 合并前 |
| Backup/restore | PowerShell 自动化 | 里程碑 |

### 23.2 覆盖率

- 核心领域和状态机行覆盖率 >= 85%；
- 核心领域分支覆盖率 >= 80%；
- DTO、配置类不作为提高覆盖率的无意义目标；
- 每个状态转换至少一个正向和一个非法转换测试。

### 23.3 测试数据

固定测试客户：

```yaml
customers:
  - alias: alice
    customerNumber: TEST-C0001
    name: 测试客户甲
    kyc: APPROVED
    savingsOpeningBalance: "10000.00"
  - alias: bob
    customerNumber: TEST-C0002
    name: 测试客户乙
    kyc: APPROVED
    savingsOpeningBalance: "5000.00"
  - alias: blocked
    customerNumber: TEST-C0003
    name: 冻结测试客户
    kyc: APPROVED
    status: SUSPENDED
```

禁止在断言中依赖数据库自增 ID。种子脚本必须把生成的 ID 写入：

```text
tests/fixtures/runtime-fixture-map.json
```

### 23.4 必须通过的端到端场景

#### E2E-001 客户开户与绑定

```text
Keycloak 创建客户 -> 模拟 KYC -> 后台审核 -> 创建/关联 Fineract Client
-> 开立储蓄账户 -> 客户登录 -> 只能看到自己的账户
```

#### E2E-002 本行转账

```text
Alice -> Bob 100 CNY
验证双方余额、渠道订单、Fineract 交易、会计分录、通知、回单和对账
```

#### E2E-003 重复提交

同一 `Idempotency-Key` 连续提交两次：

- 只产生一笔渠道订单；
- 只产生一笔 Fineract 交易；
- 第二次返回原响应；
- 审计记录包含重放标识。

#### E2E-004 幂等键请求体冲突

同一 Key 不同金额，必须返回 409，不能产生第二笔交易。

#### E2E-005 余额不足

返回 422，核心无资金交易，预留被释放。

#### E2E-006 风险人工审核

新收款人 + 大额 + 新设备 -> REVIEW_REQUIRED -> 不记账 -> Checker 审批 -> 继续执行。

#### E2E-007 模拟跨行成功

```text
SUBMITTED -> Mock Clearing SETTLED -> Fineract 扣账 -> SETTLED -> 对账一致
```

#### E2E-008 模拟跨行超时后成功

重复和乱序回调不能重复记账。

#### E2E-009 退回

已结算模拟跨行交易收到 RETURNED，生成退回流程和资金返还，不覆盖原交易。

#### E2E-010 冲正

经办申请、复核批准、生成反向交易，原记录不可删除。

#### E2E-011 权限隔离

Alice 请求 Bob 的账户 UUID，返回 404；日志不得泄露 Bob 是否存在。

#### E2E-012 贷款流程

贷款申请、审批、放款、计划、还款、逾期和结清。

#### E2E-013 日终

推进日期后利息、费用、逾期和报表状态正确。

#### E2E-014 备份恢复

恢复后所有关键不变量一致。

### 23.5 资金测试强制断言

每个资金测试必须断言：

```text
HTTP 结果
渠道订单状态
状态历史
幂等记录
预留状态
Fineract 交易数量
账户前后余额
会计借贷平衡
Outbox 数量与状态
通知记录
审计记录
对账结果
```

---

## 24. Agent 协作与执行协议

### 24.1 Agent 角色

| Agent | 角色 | 主要输出 |
|---|---|---|
| A0 | Baseline Auditor | 运行基线、版本、Swagger、风险矩阵 |
| A1 | Contract Architect | OpenAPI、AsyncAPI、JSON Schema、状态机 |
| A2 | Platform Engineer | Compose、Gateway、DB、Keycloak、监控 |
| A3 | Core Integration Engineer | Fineract Adapter、认证、错误映射 |
| A4 | Channel Backend Engineer | BFF、账户、收款人、支付、文档 |
| A5 | Customer Frontend Engineer | 客户网页、认证、账户和转账页面 |
| A6 | Payment/Risk Engineer | Mock Clearing、风险、审批、对账 |
| A7 | Operations Frontend Engineer | 支付运营、审核、对账和 DLQ 页面 |
| A8 | QA/SRE Agent | 自动化测试、监控、备份恢复、证据 |
| A9 | Integration Reviewer | 跨模块审计、回归和最终验收 |

### 24.2 并行边界

允许并行：

```text
A1 契约设计
A2 基础设施骨架
A5 前端基于 Mock Server 开发
```

必须串行：

```text
A0 完成 -> 所有 Agent
A1 契约冻结 -> A3/A4/A5/A6/A7
A3 Fineract Adapter 完成 -> 真实资金集成测试
A4/A6 完成 -> A8 E2E
A8 通过 -> A9 最终验收
```

### 24.3 文件所有权

| Agent | 可直接修改路径 |
|---|---|
| A0 | `docs/baseline/`、`scripts/baseline/` |
| A1 | `contracts/`、`docs/architecture/adr/` |
| A2 | `infra/`、`compose.channel.yaml`、`.env.example` |
| A3 | `services/bank-channel-service/**/fineract/` |
| A4 | `services/bank-channel-service/`，排除 A3/A6 专属目录 |
| A5 | `apps/customer-web/` |
| A6 | `services/mock-clearing-service/`、后端 risk/payment/reconciliation 模块 |
| A7 | `apps/operations-web/` |
| A8 | `tests/`、`scripts/test/`、`scripts/backup/`、`docs/test-evidence/` |
| A9 | 原则上只审查；修复必须单独提交 |

修改他人所有权文件前必须在 `agent/reports/<task-id>.md` 记录原因。

### 24.4 分支与提交

```text
agent/<agent-id>/<task-id>-<short-name>
```

提交格式：

```text
<type>(<scope>): <summary>

Refs: <task-id>
Contract: <contract version or N/A>
Tests: <commands>
```

允许类型：

```text
feat fix test docs refactor build chore security
```

禁止一个提交同时包含大规模格式化和业务逻辑修改。

### 24.5 Agent 单任务工作流

每个 Agent 必须执行：

```text
1. 读取本文件
2. 读取 agent/backlog.yaml 中自己的任务
3. 检查依赖任务状态
4. 检查 Git 工作区
5. 创建分支
6. 先写或确认契约和测试
7. 实现最小变更
8. 运行规定测试
9. 输出任务报告
10. 更新 execution-state.yaml
11. 提交，不自动合并
```

### 24.6 禁止行为

Agent MUST NOT：

- 删除或重建现有核心数据卷；
- 修改核心数据库业务数据来伪造成功测试；
- 绕过 Fineract API 直接记账；
- 把所有服务暴露到 `0.0.0.0`；
- 使用 `latest` 镜像；
- 提交密码、Token、数据库转储和真实 PII；
- 在没有幂等保护的情况下重试资金 POST；
- 以页面按钮隐藏代替后端授权；
- 为让测试通过而弱化断言；
- 把尚未验证的 Fineract 能力标记为完成；
- 自动升级 Fineract 主版本；
- 修改当前 `fineract_default` schema；
- 在未备份时执行破坏性命令。

### 24.7 任务报告格式

文件：`agent/reports/<task-id>.md`

```markdown
# <task-id> 执行报告

## 变更摘要

## 修改文件

## 契约变化
- OpenAPI：
- AsyncAPI：
- DB Migration：

## 执行命令

## 测试结果

## 安全影响

## 已知限制

## 回滚方式

## 验收证据
```

---

## 25. 分阶段实施计划

### Phase 0：冻结当前基线

#### 目标

确认当前系统真实状态并建立恢复点。

#### 任务

```text
BANK-0001 运行环境清单
BANK-0002 导出并解析 Swagger
BANK-0003 识别认证、租户、幂等、事件和 Maker-Checker 配置
BANK-0004 备份核心数据库
BANK-0005 建立功能验证矩阵
```

#### 退出条件

- 所有版本和镜像 digest 已锁定；
- Swagger 已保存；
- 当前系统可恢复；
- 功能清单已分为“存在、配置、验证”；
- 未对核心系统产生功能变更。

### Phase 1：契约和基础设施

#### 任务

```text
BANK-0101 创建 ADR 和 C4 架构文档
BANK-0102 建立 OpenAPI 3.1.1
BANK-0103 建立 AsyncAPI 3.1.0 和 JSON Schema
BANK-0104 建立 channel-postgres 和 Liquibase
BANK-0105 部署 Gateway
BANK-0106 部署 Keycloak 双 Realm
BANK-0107 部署可观测性骨架
BANK-0108 建立契约 CI 门禁
```

#### 退出条件

- OpenAPI、AsyncAPI 通过 lint；
- Keycloak 可完成客户 PKCE 登录；
- Channel DB 不暴露主机端口；
- Gateway 只绑定 127.0.0.1；
- 所有镜像固定版本；
- 没有修改核心数据库。

### Phase 2：客户查询闭环

#### 任务

```text
BANK-0201 Fineract Adapter 基础认证和租户
BANK-0202 客户身份映射
BANK-0203 当前客户资料 API
BANK-0204 账户列表和详情
BANK-0205 流水查询
BANK-0206 贷款查询和还款计划
BANK-0207 Customer Web 登录和资产总览
BANK-0208 客户资源越权测试
```

#### 退出条件

- Alice 只能读取 Alice 数据；
- Bob UUID 对 Alice 返回 404；
- Fineract 服务凭据不进入浏览器；
- 页面和 API 有 Trace ID；
- 查询接口契约测试和 E2E 通过。

### Phase 3：本行支付闭环

#### 任务

```text
BANK-0301 收款人管理
BANK-0302 幂等中间件
BANK-0303 转账状态机
BANK-0304 渠道余额预留
BANK-0305 Fineract Account Transfer 适配
BANK-0306 Outbox/Inbox
BANK-0307 转账页面
BANK-0308 回单和通知
BANK-0309 CHANNEL_TO_CORE 对账
```

#### 退出条件

- 本行转账端到端完成；
- 重复请求不重复记账；
- 余额不足无核心交易；
- 回单、通知、审计和对账齐全；
- 非法状态转换测试全部通过。

### Phase 4：模拟跨行支付和风险

#### 任务

```text
BANK-0401 Mock Clearing 服务
BANK-0402 跨行状态机和回调
BANK-0403 风险规则引擎
BANK-0404 MFA Step-up
BANK-0405 人工审核流程
BANK-0406 Operations Web 支付审核
BANK-0407 CHANNEL_TO_CLEARING 对账
BANK-0408 超时、重复、乱序和退回测试
```

#### 退出条件

- 所有 Mock 场景可重复执行；
- 重复或乱序回调不重复记账；
- REVIEW 不会提前扣账；
- 清算和核心差异可见且可处理；
- 操作员与复核员分离。

### Phase 5：贷款和银行运营增强

#### 任务

```text
BANK-0501 贷款申请草稿和提交
BANK-0502 贷款材料和文档
BANK-0503 贷款评分
BANK-0504 贷款 Maker-Checker
BANK-0505 放款、还款、逾期和结清测试
BANK-0506 柜员现金能力验证
BANK-0507 账户冻结、销户和定期到期验证
```

#### 退出条件

- 贷款全生命周期可执行；
- 经办人不能审批自己的贷款；
- 贷款本金、利息、费用和总账核对通过。

### Phase 6：日终、恢复和最终验收

#### 任务

```text
BANK-0601 日终编排
BANK-0602 业务日期时间旅行
BANK-0603 会计平衡断言
BANK-0604 监控告警
BANK-0605 备份恢复自动化
BANK-0606 安全扫描
BANK-0607 全量回归
BANK-0608 最终审计报告
```

#### 退出条件

- E2E-001 至 E2E-014 全部通过；
- 恢复演练成功；
- 无 P0/P1 安全缺陷；
- 监控能发现依赖故障、积压、差异和日终失败；
- 生成最终能力矩阵。

---

## 26. Agent 机器可读任务清单

以下内容应保存为 `agent/backlog.yaml`。状态只允许：

```text
TODO, READY, IN_PROGRESS, BLOCKED, REVIEW, DONE
```

```yaml
schemaVersion: 1
project: mifos-isolated-digital-bank
root: 'C:\\Users\\fujunye\\Documents\\实习\\mifos-isolated'
defaultBranch: main
constraints:
  preserveExistingCore: true
  directWriteToFineractDatabase: false
  exposeDatabasePortsToHost: false
  realMoney: false
  tenant: default
qualityGates:
  contractLint: true
  unitTests: true
  integrationTests: true
  e2eForMoneyChange: true
  reconciliationAssertion: true
  securityReview: true
phases:
  - id: P0
    name: baseline
    tasks:
      - id: BANK-0001
        owner: A0
        title: Inventory runtime and containers
        status: READY
        dependsOn: []
        allowedPaths:
          - docs/baseline/**
          - scripts/baseline/**
        outputs:
          - docs/baseline/container-inventory.json
          - docs/baseline/runtime-inventory.md
          - infra/versions.lock.yaml
        acceptance:
          - All running containers have image version and digest
          - Host port mappings are recorded
          - No secret value is written to reports
      - id: BANK-0002
        owner: A0
        title: Export local Fineract OpenAPI
        status: TODO
        dependsOn: [BANK-0001]
        outputs:
          - docs/baseline/swagger-original.json
          - docs/baseline/fineract-api-index.md
        acceptance:
          - OpenAPI file parses successfully
          - Client savings loan transfer audit and maker-checker APIs are indexed
      - id: BANK-0003
        owner: A0
        title: Audit security and operational configuration
        status: TODO
        dependsOn: [BANK-0001, BANK-0002]
        outputs:
          - docs/baseline/security-config.md
          - docs/baseline/risk-register.md
        acceptance:
          - Authentication mode is verified
          - Tenant header is verified
          - Fineract idempotency header is verified
          - Maker-checker and external event settings are verified
      - id: BANK-0004
        owner: A8
        title: Create verified core backup
        status: TODO
        dependsOn: [BANK-0001]
        outputs:
          - docs/test-evidence/core-backup-verification.md
        acceptance:
          - Backup SHA-256 exists
          - Restore command is documented
          - Backup file is ignored by Git
  - id: P1
    name: contracts-and-platform
    tasks:
      - id: BANK-0101
        owner: A1
        title: Freeze domain state machines and API contracts
        status: TODO
        dependsOn: [BANK-0002, BANK-0003]
        allowedPaths:
          - contracts/**
          - docs/architecture/**
        outputs:
          - contracts/openapi/customer-api.yaml
          - contracts/openapi/operations-api.yaml
          - contracts/asyncapi/bank-events.yaml
        acceptance:
          - OpenAPI 3.1.1 parses and lints
          - AsyncAPI 3.1.0 parses and lints
          - All money fields are decimal strings
          - All money-changing endpoints require Idempotency-Key
      - id: BANK-0102
        owner: A2
        title: Add isolated channel infrastructure
        status: TODO
        dependsOn: [BANK-0001]
        allowedPaths:
          - infra/**
          - compose.channel.yaml
          - .env.example
        outputs:
          - compose.channel.yaml
          - infra/versions.lock.yaml
        acceptance:
          - Channel PostgreSQL has no host port
          - Gateway binds to 127.0.0.1
          - Core volumes are not replaced
          - All images are pinned
      - id: BANK-0103
        owner: A2
        title: Configure Keycloak customer and internal realms
        status: TODO
        dependsOn: [BANK-0102]
        outputs:
          - infra/keycloak/realm-bank-customer.json
          - infra/keycloak/realm-bank-internal.json
        acceptance:
          - Customer Web uses Authorization Code with PKCE
          - Customer and employee identities are isolated
          - Secrets are not committed
  - id: P2
    name: customer-read-model
    tasks:
      - id: BANK-0201
        owner: A3
        title: Implement Fineract adapter
        status: TODO
        dependsOn: [BANK-0101, BANK-0102]
        acceptance:
          - Tenant and authentication are centralized
          - Error mapping uses Problem Details
          - POST retry is disabled without an idempotency key
          - Integration tests use the local Fineract instance
      - id: BANK-0202
        owner: A4
        title: Implement customer identity link and account query API
        status: TODO
        dependsOn: [BANK-0101, BANK-0103, BANK-0201]
        acceptance:
          - Customer can only access linked Fineract client
          - Foreign resource identifiers return 404
          - Account number is masked
      - id: BANK-0203
        owner: A5
        title: Implement customer login and dashboard
        status: TODO
        dependsOn: [BANK-0101, BANK-0103]
        acceptance:
          - Tokens are not stored in localStorage
          - Account and loan data render from contract mocks then real API
          - Accessibility smoke checks pass
  - id: P3
    name: internal-payments
    tasks:
      - id: BANK-0301
        owner: A4
        title: Implement beneficiary and idempotency modules
        status: TODO
        dependsOn: [BANK-0202]
        acceptance:
          - Beneficiary account data is tokenized or encrypted
          - Same idempotency key with different body returns 409
      - id: BANK-0302
        owner: A6
        title: Implement transfer state machine and outbox
        status: TODO
        dependsOn: [BANK-0101, BANK-0301]
        acceptance:
          - Illegal state transitions return 409
          - Business update and outbox insert are atomic
          - Consumer inbox prevents duplicate processing
      - id: BANK-0303
        owner: A3
        title: Integrate Fineract account transfer
        status: TODO
        dependsOn: [BANK-0201, BANK-0302]
        acceptance:
          - Fineract receives a stable idempotency key
          - Duplicate request creates one core transaction
          - Fineract transaction reference is persisted
      - id: BANK-0304
        owner: A8
        title: Verify internal transfer end to end
        status: TODO
        dependsOn: [BANK-0303]
        acceptance:
          - E2E-002 through E2E-006 pass
          - Core and channel reconciliation is MATCHED
          - Debit and credit accounting totals are equal
  - id: P4
    name: mock-clearing-risk-operations
    tasks:
      - id: BANK-0401
        owner: A6
        title: Implement mock clearing service
        status: TODO
        dependsOn: [BANK-0101, BANK-0102]
        acceptance:
          - Success delayed timeout return duplicate and out-of-order scenarios exist
          - Callback requests are signed in local environment
          - Callback delivery is at-least-once
      - id: BANK-0402
        owner: A6
        title: Implement risk rules and manual review
        status: TODO
        dependsOn: [BANK-0302]
        acceptance:
          - ALLOW REVIEW and BLOCK decisions are reproducible
          - REVIEW does not create a core money transaction
          - Maker and checker cannot be the same subject
      - id: BANK-0403
        owner: A7
        title: Implement payment operations UI
        status: TODO
        dependsOn: [BANK-0402]
        acceptance:
          - Review queue and reconciliation differences are visible
          - Approval requests require reason and current version
      - id: BANK-0404
        owner: A8
        title: Verify external mock payments
        status: TODO
        dependsOn: [BANK-0401, BANK-0402, BANK-0403]
        acceptance:
          - E2E-007 through E2E-010 pass
          - Duplicate and out-of-order callbacks do not double-post
  - id: P6
    name: reliability-and-final-audit
    tasks:
      - id: BANK-0601
        owner: A8
        title: Implement monitoring and alert verification
        status: TODO
        dependsOn: [BANK-0304, BANK-0404]
        acceptance:
          - Core outage creates an alert
          - Reconciliation difference creates an alert
          - DLQ non-empty creates an alert
      - id: BANK-0602
        owner: A8
        title: Automate backup and restore drill
        status: TODO
        dependsOn: [BANK-0601]
        acceptance:
          - E2E-014 passes
          - Restored balances and audit chain match
      - id: BANK-0603
        owner: A9
        title: Final architecture and security review
        status: TODO
        dependsOn: [BANK-0602]
        acceptance:
          - No direct writes to Fineract databases
          - No host-exposed database or broker ports
          - No unresolved P0 or P1 findings
          - Final feature verification matrix is complete
```

---

## 27. 主控 Agent 提示词

以下提示词可直接交给负责统筹项目的主 Agent：

```text
你是 mifos-isolated 数字银行沙箱项目的主控工程 Agent。

项目根目录：
C:\Users\fujunye\Documents\实习\mifos-isolated

现有系统：
- Apache Fineract API：http://127.0.0.1:13000
- Mifos X Web：http://127.0.0.1:18080
- 默认租户：default
- PostgreSQL 和 ActiveMQ 不暴露主机端口
- 当前系统运行正常，禁止破坏现有核心环境

你必须首先完整读取：
1. Apache_Fineract_Mifos_Agent_Implementation_Plan.md
2. agent/backlog.yaml
3. agent/execution-state.yaml
4. docs/baseline 下的全部基线文件

执行规则：
1. 任何开发前先完成 Phase 0。
2. 禁止直接写 fineract_default 和 fineract_tenants。
3. 禁止自动升级 Fineract、Mifos、PostgreSQL 或替换现有数据卷。
4. 所有新增 HTTP API 先修改 OpenAPI 3.1.1；所有新增事件先修改 AsyncAPI 3.1.0 和 JSON Schema。
5. 所有资金写操作必须有 Idempotency-Key、状态机、审计、自动化测试和对账断言。
6. Customer Web 禁止直接访问 Fineract。
7. 只有在本地 Fineract 精确版本与 Self Service Plugin 完成兼容验证后，才允许通过 ADR 使用插件；默认实现独立 Customer BFF。
8. 每次只领取一个 READY 任务，检查 dependsOn 后把状态改为 IN_PROGRESS。
9. 仅修改任务 allowedPaths。跨路径修改必须在执行报告中说明。
10. 完成任务后运行规定测试，生成 agent/reports/<task-id>.md，并将状态改为 REVIEW。不得自行标记 DONE；DONE 由审查 Agent 设置。
11. 不得泄露密钥、Token、完整账户号、证件号和数据库密码。
12. 遇到不确定的 Fineract 端点时必须以本地 Swagger 为准，不得凭记忆构造接口。
13. 遇到可能破坏数据的命令必须停止执行，先生成备份并记录回滚步骤。
14. 不允许以“容器启动成功”代替业务验收。

任务完成定义：
- 契约已更新并通过 lint；
- 代码已实现；
- Unit/Integration/Contract 测试通过；
- 资金类功能 E2E、核心余额和会计断言通过；
- 安全影响和回滚方式已记录；
- 无未提交密钥和测试数据转储；
- 执行报告完整。
```

---

## 28. 单任务 Agent 提示词模板

```text
任务 ID：{{TASK_ID}}
角色：{{AGENT_ID}}
项目根目录：C:\Users\fujunye\Documents\实习\mifos-isolated

在执行前：
1. 完整读取 Apache_Fineract_Mifos_Agent_Implementation_Plan.md。
2. 从 agent/backlog.yaml 读取 {{TASK_ID}} 的 dependsOn、allowedPaths、outputs 和 acceptance。
3. 确认所有依赖状态为 DONE。
4. 检查 git status 和现有基线标签。
5. 不得重复实现已经存在且已验证的能力。

执行要求：
- 契约优先；
- 最小变更；
- 不写 Fineract 数据库；
- 不修改现有核心数据卷；
- 不提交秘密；
- 所有外部 ID 和版本从实际运行环境读取；
- 资金类代码必须处理重复请求、超时、重试、乱序、失败和冲正；
- 测试不得 Mock 掉被本任务要求验证的核心集成点。

交付物：
- backlog 中声明的全部 outputs；
- 对应测试；
- agent/reports/{{TASK_ID}}.md；
- execution-state.yaml 状态更新为 REVIEW；
- 一个或多个符合提交规范的 Git commit。

完成前逐条核对 acceptance。任一条无法满足时将状态设为 BLOCKED，并在报告中记录：阻塞原因、已完成内容、证据和解除阻塞所需输入。不得虚报完成。
```

---

## 29. CI 门禁

建议创建以下流水线阶段：

```text
validate
  -> contract-lint
  -> unit-test
  -> architecture-test
  -> build
  -> integration-test
  -> local-core-integration
  -> e2e
  -> reconciliation-test
  -> security-scan
  -> package
```

### 29.1 必须失败的情况

- OpenAPI 或 AsyncAPI 不可解析；
- OpenAPI 实现与契约不一致；
- Liquibase 校验失败；
- 出现未授权跨客户访问；
- 资金测试缺少幂等断言；
- 会计借贷不平；
- 对账存在未标记差异；
- 镜像使用 `latest`；
- 检测到密钥；
- 新增数据库主机端口映射；
- 核心数据库出现非 Fineract Liquibase 的结构变更。

### 29.2 推荐命令

```powershell
# 契约
npm run lint:openapi
npm run lint:asyncapi
npm run validate:schemas

# Java
.\mvnw.cmd spotless:check
.\mvnw.cmd test
.\mvnw.cmd verify

# 前端
npm ci
npm run lint
npm run typecheck
npm run test
npm run build

# E2E
npx playwright test

# Compose

docker compose -f compose.yaml -f compose.channel.yaml config
```

实际命令以生成的项目构建文件为准，并写入根目录统一脚本：

```text
scripts/test/all.ps1
```

---

## 30. Definition of Done

一个模块只有同时满足以下条件才能标记 DONE：

### 契约

- OpenAPI/AsyncAPI/JSON Schema 已更新；
- 示例请求和响应可通过 Schema；
- 破坏性变化已升级契约版本；
- 错误码有定义。

### 实现

- 没有绕过分层；
- 没有直接写核心库；
- 金额使用 BigDecimal/NUMERIC；
- 状态机集中定义；
- 配置没有硬编码密钥；
- 数据库迁移可重复执行。

### 安全

- 认证和授权测试通过；
- 客户隔离测试通过；
- PII 脱敏；
- 无密钥进入 Git；
- 写操作有审计；
- 受控操作有 Maker-Checker。

### 可靠性

- 幂等；
- 超时；
- 重试；
- 熔断；
- Outbox/Inbox；
- DLQ；
- 对账；
- 可回滚。

### 测试

- Unit、Contract、Integration 通过；
- 资金模块 E2E 通过；
- 核心余额和会计断言通过；
- 证据文件已保存。

### 运维

- 指标、日志和 Trace 可查询；
- 告警已验证；
- Runbook 已更新；
- 备份范围已覆盖新增数据。

---

## 31. 最终能力验收矩阵模板

```markdown
| 能力 | 接口存在 | 已配置 | E2E 通过 | 会计核对 | 安全测试 | 自动化测试 | 状态 |
|---|---:|---:|---:|---:|---:|---:|---|
| 客户登录 | 是 | 是 | 是 | N/A | 是 | 是 | DONE |
| 账户查询 | 是 | 是 | 是 | 是 | 是 | 是 | DONE |
| 本行转账 | 是 | 是 | 是 | 是 | 是 | 是 | DONE |
| 模拟跨行 | 是 | 是 | 是 | 是 | 是 | 是 | DONE |
| 贷款申请 | 是 | 是 | 是 | 是 | 是 | 是 | DONE |
| 冲正 | 是 | 是 | 是 | 是 | 是 | 是 | DONE |
| 日终 | 是 | 是 | 是 | 是 | 是 | 是 | DONE |
| 备份恢复 | N/A | 是 | 是 | 是 | 是 | 是 | DONE |
```

状态定义：

```text
NOT_STARTED
IMPLEMENTED_NOT_VERIFIED
PARTIALLY_VERIFIED
VERIFIED
BLOCKED
```

---

## 32. 第一轮实际执行顺序

主 Agent 收到本文件后，应立即按以下顺序工作：

```text
1. 创建 docs/baseline、agent、contracts、infra 的空目录和说明文件
2. 执行 BANK-0001
3. 执行 BANK-0002
4. 执行 BANK-0003
5. 执行 BANK-0004
6. 根据真实 Fineract 版本决定：
   A. 独立 Customer BFF（默认）
   B. 兼容的 Self Service Plugin（必须有 ADR 和完整回归）
7. 冻结 customer-api.yaml 和 bank-events.yaml 的第一版
8. 新建 compose.channel.yaml，不修改现有核心服务定义
9. 部署 Channel DB、Keycloak、Gateway 和可观测性骨架
10. 先完成只读客户闭环，再开发资金功能
11. 本行转账完整通过后，才实现模拟跨行
12. 对账、冲正、日终和恢复完成前，不得宣称系统达到银行沙箱验收标准
```

---

## 33. 风险登记

| ID | 风险 | 等级 | 缓解措施 |
|---|---|---:|---|
| R-001 | 当前 Fineract 版本未知，插件可能不兼容 | 高 | Phase 0 锁定版本；默认 BFF |
| R-002 | 渠道预留无法阻止柜面并发扣款 | 高 | P0 标明限制；P1 接入核心冻结能力 |
| R-003 | Fineract 幂等 Header 名称可能非标准拼写 | 高 | 运行时发现并由 Adapter 映射 |
| R-004 | 同一资金操作跨渠道和核心无法使用单数据库事务 | 高 | Saga + 幂等 + 对账 + 人工差错处理 |
| R-005 | ActiveMQ 已部署但持久化/DLQ 未验证 | 中 | 基线审计；不能安全复用则独立 Broker |
| R-006 | Mifos 页面存在不代表 RBAC 已启用 | 高 | 前后端权限双重测试 |
| R-007 | 测试直接使用真实日期导致逾期和利息测试耗时 | 中 | 业务日期和时间旅行脚本 |
| R-008 | 自动生成 PDF 与核心流水不一致 | 中 | 文档生成前读取最终交易；SHA-256 和对账 |
| R-009 | Agent 并行修改同一文件产生冲突 | 中 | 文件所有权、任务依赖和独立分支 |
| R-010 | 通过直接改库修复差异破坏审计 | 高 | 明确禁止；通过补偿交易和审批处理 |

---

## 34. 规范依据

本方案的关键技术选择依据以下官方规范和项目文档：

1. Apache Fineract 当前平台文档：Maker-Checker、细粒度权限、幂等、批处理、OAuth、可靠外部事件。
2. Apache Fineract API 文档和本地 Swagger：所有实际端点和字段的最终事实源。
3. Mifos Self Service Plugin：客户自助能力参考；当前要求 Fineract 1.15.0-SNAPSHOT，且无正式 Release。
4. Mifos X Web App：员工后台和配置能力参考。
5. OpenAPI Specification 3.1.1。
6. JSON Schema Draft 2020-12。
7. AsyncAPI Specification 3.1.0。
8. CloudEvents Specification 1.0.2。
9. Keycloak 官方服务器与反向代理配置指南。

本方案固定使用 OpenAPI 3.1.1 而不是更新的 3.2.0，是出于当前工具链兼容性和稳定性考虑，不代表 3.2.0 不可用。

---

# 附录 A：最小完成形态

当以下组件全部运行并通过验收时，系统可称为“本地数字银行沙箱”：

```text
现有 Fineract Core
现有 Mifos X Staff Web
Customer Web
API Gateway
Keycloak
Bank Channel Service
Mock Clearing
Channel PostgreSQL
Event Bus
MailHog/SMS Stub
Operations Web
Prometheus/Grafana/Loki/OTel
自动化测试、对账、日终和备份恢复脚本
```

# 附录 B：最终判定

当前系统已经具备核心账务和员工后台基础。严格按本文件完成 Phase 0 至 Phase 6 后，系统才满足以下定义：

> 一个不连接真实支付网络，但具备客户网上银行、核心账户、储蓄和贷款、模拟支付清算、风险审核、双人复核、电子凭证、会计核对、日终、监控、审计和恢复能力的本地数字银行业务沙箱。
