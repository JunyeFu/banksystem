---
id: DOC-FE-TRANSFER-FIVE-PAGE-ADJUSTMENT
title: 转账闭环五页面前后端双向调整方案
document_type: design
domain: frontend
status: accepted
authority: normative
version: 1.1
effective_date: 2026-07-15
owner: project-owner
related_contracts: [contracts/openapi/customer-api.yaml, contracts/openapi/operations-api.yaml]
related_code: [apps/customer-portal, apps/operations-console, services/bank-channel-service]
---

# 转账闭环五页面前后端双向调整方案

本方案把客户转账三页和运营支付两页作为首个跨端垂直切片。2026-07-15 已按本方案完成五页、契约、后端读模型、生成客户端与最小 UI Kit 的首轮实现；发布级 Docker 金融 E2E 仍需在具备本地测试凭据的环境单独执行。

## 1. 页面与 PV 范围

| 编号 | 页面 | 路由 | 当前组件 | PV 状态 | 状态数 |
|---|---|---|---|---|---:|
| FE-T01 | 转账列表 | `/portal/transfers` | `TransferList.tsx` | PV-0021–PV-0027 | 7 |
| FE-T02 | 新建转账 | `/portal/transfers/new` | `TransferCreate.tsx` | PV-0028–PV-0034 | 7 |
| FE-T03 | 转账结果 | `/portal/transfers/:transferId` | `TransferResult.tsx` | PV-0035–PV-0038 | 4 |
| FE-T04 | 支付监控 | `/ops/payments` | `PaymentMonitoring.tsx` | PV-0072–PV-0083 | 12 |
| FE-T05 | 支付详情 | `/ops/payments/:transferId` | `PaymentDetail.tsx` | PV-0084–PV-0089 | 6 |

合计 5 个页面、36 个逻辑设计状态。路由参数由 `paymentId` 统一命名为 `transferId`，URL 结构不变。

## 2. 实现前核验基线

| 证据 | 当前事实 | 对五页的影响 |
|---|---|---|
| 客户前端模型 | 使用 `paymentId/fromAccountId/toAccount/createdDate` | 与后端 `transferId/sourceAccountId/destinationAccountId` 不一致 |
| 客户创建请求 | 前端发送 `fromAccountId/toAccount/description` | 后端接收 `sourceAccountId/destinationAccountId/reference`，当前请求无法按契约工作 |
| 客户创建响应 | 后端返回 `transferId` | 前端读取 `paymentId` 后跳转，可能形成 `undefined` 路由 |
| 收款人列表 | 后端返回 `beneficiaryId/displayName/maskedAccountNumber` | 前端读取 `id/name/accountNumber`，且不存在可提交的真实目标账户字段 |
| 客户转账读取 | 前端调用列表和详情 GET | Controller 未实现客户列表和客户详情映射 |
| 运营支付读取 | 前端调用列表和详情 GET | Controller 未实现运营列表；详情只返回 6 个基础字段 |
| 运营详情模型 | 前端要求 `stateHistory/outboxEvents/auditCount` | 当前详情 Controller 未组装这些读模型 |
| OpenAPI | 客户契约把 `createBeneficiary` 错挂在回单路径下 | 生成客户端会产生错误操作路径 |
| 幂等规则 | 客户 OpenAPI 最小 8，后端最小 16 | 必须统一为 16–128 字符 |
| 状态规则 | 后端是 12 态状态机 | 客户页面仍以 `COMPLETED/SUCCESS/PENDING/PROCESSING` 映射，不能表达真实状态 |

## 3. 双向调整决策

| 决策 | 后端/契约调整 | 前端/设计调整 | 责任结论 |
|---|---|---|---|
| D01 统一标识 | 所有响应使用 `transferId` | 路由变量、Query Key、测试标识改用 `transferId` | 后端事实优先 |
| D02 安全收款人引用 | 客户创建请求使用 `beneficiaryId`；后端按当前 subject 解析已验证的目标账户引用 | 表单只提交收款人 ID，不读取或拼接账号 | 安全与隐私优先 |
| D03 收款人可执行化 | Liquibase 为收款人增加可解析的核心目标引用；创建时由服务校验并保存，不返回原账号 | 下拉仅显示 `displayName/maskedAccountNumber` | 后端补齐能力 |
| D04 客户读模型 | 新增 subject-scoped 列表与详情 GET，禁止读取他人转账 | 列表、结果页只消费客户读模型 | 后端补齐能力 |
| D05 运营读模型 | 新增分页列表；详情组合状态历史、Outbox 元数据和审计数量 | 支付两页不再假定基础详情包含扩展字段 | 双向收敛 |
| D06 真实状态 | OpenAPI 固定 12 态枚举，终态为 `SETTLED/FAILED/TIMED_OUT/RETURNED/REVERSED` | 所有 Tag、筛选、结果文案按 12 态设计；删除伪状态映射 | 状态机事实优先 |
| D07 异步结果 | 详情返回当前状态和 `updatedAt` | 结果页轮询非终态，进入终态后停止；HTTP 202 不展示为完成 | 双向收敛 |
| D08 金额与时间 | 金额为两位小数字符串；时间为带时区 ISO 8601 | 禁止 JS 浮点运算；统一金额和时间格式化 | 银行业规则优先 |
| D09 错误模型 | 所有错误返回 RFC 9457 Problem Details 和稳定 `code` | 页面按 `code` 呈现字段错误、冲突、无权限、未找到和可重试错误 | 双向收敛 |
| D10 视觉边界 | 后端不为视觉稿增加无业务意义字段 | 视觉稿调整到真实字段、权限和状态；布局和信息层级按 PV 优化 | 各层各自负责 |
| D11 转账确认 | 保持一次确认后提交，不新增 OTP 或独立确认页 | 按既有确认记录保留当前流程 | 已冻结产品决策 |
| D12 回单入口 | 回单接口仅对有权客户开放，未生成时返回稳定错误码 | 仅在可用状态显示下载入口，不用静态回单占位 | 双向收敛 |

## 4. 目标 API 合同

| 页面 | 方法与路径 | operationId | 目标响应/行为 |
|---|---|---|---|
| FE-T01 | `GET /api/customer/v1/transfers` | `listCustomerTransfers` | subject-scoped 分页 `CustomerTransferPage`，支持真实状态筛选 |
| FE-T02 | `POST /api/customer/v1/transfers` | `createCustomerTransfer` | 接收 `sourceAccountId/beneficiaryId/amount/currency/reference`，返回 202 `CustomerTransferDetail` |
| FE-T03 | `GET /api/customer/v1/transfers/{transferId}` | `getCustomerTransfer` | 返回脱敏账户、当前状态、时间、核心参考号和回单可用性 |
| FE-T03 | `GET /api/customer/v1/transfers/{transferId}/receipt` | `getTransferReceipt` | JSON/PDF 回单；subject ownership 强制校验 |
| FE-T04 | `GET /api/operations/v1/transfers` | `listOperationsTransfers` | 分页，支持 `status/correlationId` 筛选 |
| FE-T05 | `GET /api/operations/v1/transfers/{transferId}` | `getOperationsTransfer` | `OperationsTransferDetail`，包含状态历史、Outbox 安全元数据和审计数量 |

客户创建和运营创建必须使用不同 Request Schema，不能因为当前共用一个 Controller 方法而把内部目标账户 ID 暴露给客户浏览器。

### 4.1 客户创建请求

```json
{
  "sourceAccountId": "opaque-account-id",
  "beneficiaryId": "uuid",
  "amount": "8800.00",
  "currency": "CNY",
  "reference": "经营往来"
}
```

### 4.2 稳定问题码

最低集合：`TRANSFER_INVALID`、`TRANSFER_NOT_FOUND`、`TRANSFER_FORBIDDEN`、`BENEFICIARY_NOT_FOUND`、`BENEFICIARY_NOT_RESOLVABLE`、`IDEMPOTENCY_KEY_REQUIRED`、`IDEMPOTENCY_KEY_CONFLICT`、`TRANSFER_STATE_CONFLICT`、`CORE_TRANSFER_REJECTED`、`RECEIPT_NOT_READY`。

## 5. 五页面重建设计

### FE-T01 转账列表

- PV：PV-0021–PV-0027。
- 重建：统一客户壳层、右上角新建转账、真实状态 Select、服务端分页、金额右对齐、整行进入详情。
- 状态：加载、正常、空、已结算筛选、失败筛选、风险复核筛选、筛选展开、错误、无权限。
- 禁止：前端本地伪分页、用 `COMPLETED/SUCCESS` 替代 `SETTLED`、显示未脱敏目标账户。

### FE-T02 新建转账

- PV：PV-0028–PV-0034。
- 重建：760px 表单与只读摘要；账户和收款人都使用后端 ID；金额以字符串进入请求转换层。
- 状态：默认、校验错误、提交中、接口错误、两个下拉展开、收款人预填、依赖加载失败。
- 幂等：一次页面意图生成一个键；未知结果允许用同键重试，修改请求正文必须生成新键。
- 禁止：从脱敏账号拼目标账号、用 JS number 执行金融计算、提交中重复点击。

### FE-T03 转账结果

- PV：PV-0035–PV-0038。
- 重建：结果语义区、事实 Descriptions、异步状态刷新、失败原因、回单入口、再转一笔和返回列表。
- 状态：已结算、失败、待审批、数据缺失，并补齐其他非终态、无权限和未找到。
- 禁止：把 202 当作成功结算、对所有错误显示同一句文本、无回单时提供假下载。

### FE-T04 支付监控

- PV：PV-0072–PV-0083。
- 重建：展开/收起侧栏兼容；状态 Select、关联 ID 搜索、服务端分页、状态中文化、行点击详情。
- 状态：加载、正常、空、风险复核、失败、筛选展开，各自覆盖两种侧栏状态。
- 禁止：当前把搜索字符串直接拼为 `status`、复制 ID 代替详情导航、客户端伪造统计。

### FE-T05 支付详情

- PV：PV-0084–PV-0089。
- 重建：关键事实、状态时间线、Outbox 元数据、审计数量；事件失败必须显示可诊断但不泄密的信息。
- 状态：正常、事件投递失败、无详情，各自覆盖两种侧栏状态；另补加载、错误、无权限。
- 安全：Outbox 不返回 payload、headers、Token 或凭据；客户 subject 和内部审计字段不在普通表格展开。

## 6. 实现顺序

1. 修复 OpenAPI 结构错误并冻结目标 Schema、枚举、错误码和示例。
2. 实现收款人目标引用迁移、客户列表/详情、运营列表/组合详情和权限测试。
3. 从 OpenAPI 生成共享类型与 API Client，删除五页相关手写 DTO/字符串路径。
4. 建立最小 `bank-ui-kit`：Token、`StatusTag`、`MoneyText`、`PageState`、筛选栏和详情时间线。
5. 依次重建 FE-T02、FE-T03、FE-T01、FE-T04、FE-T05；先打通写入与结果，再扩展两端查询。
6. 完成契约、组件、Playwright、视觉对照和无障碍验收。

## 7. 完成门禁

- 6 个目标 API 操作均有唯一 `operationId`、完整 Schema、示例、权限和 Problem Details。
- OpenAPI 生成客户端是五页唯一 API 调用入口，不保留相关手写 DTO。
- 客户列表/详情通过 subject ownership 负向测试；运营端通过角色矩阵测试。
- 转账创建通过幂等回放、同键异体 409、金额精度、收款人越权和状态机测试。
- 36 个 PV 状态逐一关联到 Storybook 或页面 Fixture；PV 是设计参考，不直接作为运行视觉基线。
- 两个应用通过 TypeScript build、单元测试、Playwright 完整闭环和 1440×900 视觉对照。
- Java 单元/集成测试、OpenAPI 校验、数据库迁移和回滚验证全部通过。

## 8. 2026-07-15 实现结果

- `customer-api.yaml` 与 `operations-api.yaml` 已补齐客户/运营列表、详情、客户受益人引用和组合证据读模型，并由 `openapi-typescript` 生成共享类型。
- Bank Channel Service 已通过 Liquibase 保存受益人解析后的核心目标引用；客户创建按 subject 校验账户和收款人，客户/运营列表及详情已实现。
- 客户转账列表、新建、结果与运营支付监控、详情共五页已重建，共享红白黑银行主题、12 态文案、金额/时间格式化和安全 Outbox 展示。
- Java 33 项测试、共享包 7 项测试、两个 Vite 生产构建、Redocly OpenAPI lint、PowerShell 语法和文档校验已通过。
- 已使用固定 1440×900 Playwright 画布对 PV-0022、PV-0028、PV-0035、PV-0073、PV-0084 进行多模态对照并迭代；浏览器导航、必填校验和控制台错误检查通过。
- 未在本次无凭据会话执行 Docker 金融 E2E、真实 Keycloak 角色矩阵和 Liquibase 实库回滚；这些仍是发布门禁，不影响代码级实现结论。
