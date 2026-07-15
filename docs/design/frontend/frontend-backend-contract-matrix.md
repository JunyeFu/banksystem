---
id: DOC-FE-CONTRACT-MATRIX
title: 前后端契约矩阵
document_type: reference
domain: contract
status: proposed
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
related_contracts: [contracts/openapi/customer-api.yaml, contracts/openapi/operations-api.yaml, contracts/openapi/test-support-api.yaml]
---

# 前后端契约矩阵

本矩阵是前端页面进入开发的前置门禁。`operationId`、请求/响应 Schema、错误码、权限和 Mock 未确定的操作不得接入真实页面。

| 页面/闭环 | 操作 | 当前契约 | 当前判断 | 开发门禁 |
|---|---|---|---|---|
| 客户账户 | 查询本人和账户 | `customer-api.yaml` | 已有基础 | 核对实现响应与前端模型 |
| 客户转账 | 创建、列表、详情、回单 | `customer-api.yaml` | 部分覆盖 | 补齐列表/详情、错误与幂等语义 |
| 客户贷款 | 申请、提交、核心处理、还款、关闭 | `customer-api.yaml` | 已有主要路径 | 补齐查询、文档与状态枚举 |
| 客户资料 | 收款人、通知、对账单 | `customer-api.yaml` | 已有基础 | 补齐分页、空态和错误模型 |
| 运营支付 | 创建、详情、冲正、审批 | `operations-api.yaml` | 不完整 | 覆盖全部控制器并统一 operationId |
| 运营贷款/风险 | 评分、批准、风险决策 | 未完整声明 | 缺口 | 完成 OpenAPI 后才能重构交互 |
| 清算/对账/日终 | 触发、查询最新结果 | 未完整声明 | 缺口 | 明确内部/运营边界与错误码 |
| 测试支撑 | Fixture、断言、业务日期 | `test-support-api.yaml` | 基础较完整 | 保持 local/test 与角色限制 |
| 衡准用例/基线 | 用例、版本、审批、基线 | 仅 JSON Schema | 未实现服务契约 | 新建平台 OpenAPI |
| 衡准运行/证据 | 运行、验证、Artifact、调度、事件 | 无完整 OpenAPI | 未实现 | B2-B4 契约优先落地 |

## 首批五页面核验结论

| 页面 | 当前前端调用 | 当前后端事实 | 调整结论 |
|---|---|---|---|
| 转账列表 | `GET /api/customer/v1/transfers` | 无对应 GET Controller/OpenAPI 操作 | 新增 subject-scoped 分页操作 `listCustomerTransfers` |
| 新建转账 | `POST /api/customer/v1/transfers`，字段和响应标识错位 | POST 已实现，要求 16–128 位幂等键 | 客户请求改用 `beneficiaryId`；统一 `transferId` 和 Problem Details |
| 转账结果 | `GET /api/customer/v1/transfers/{id}` | 仅有运营详情 GET；客户回单 GET 已有 | 新增客户详情，轮询真实 12 态，按回单可用性显示入口 |
| 支付监控 | `GET /api/operations/v1/transfers?status=` | `/transfers` 只有 POST | 新增分页筛选操作 `listOperationsTransfers` |
| 支付详情 | `GET /api/operations/v1/transfers/{id}` | 仅返回 6 个基础字段 | 扩展为状态历史、Outbox 安全元数据和审计数量的组合读模型 |

完整 Actual-Target-Decision 与 36 个 PV 状态见 [`transfer-five-page-bidirectional-adjustment.md`](transfer-five-page-bidirectional-adjustment.md)。

## 每行最终必须补齐的字段

`route`、`action`、`operationId`、`requestSchema`、`responseSchema`、`problemCodes`、`role`、`idempotency`、`mockFixture`、`backendStatus`、`contractTest`、`playwrightCase`。

前端 TypeScript 类型与 API Client 必须由 OpenAPI 生成；不再新增手写字符串接口路径和重复 DTO。
