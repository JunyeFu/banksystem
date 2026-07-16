---
id: DOC-FE-CONTRACT-MATRIX
title: 前后端契约矩阵
document_type: reference
domain: contract
status: accepted
authority: normative
version: 1.1
effective_date: 2026-07-15
owner: project-owner
related_contracts: [contracts/openapi/customer-api.yaml, contracts/openapi/operations-api.yaml, contracts/openapi/test-support-api.yaml, contracts/openapi/quality-platform-api.yaml]
---

# 前后端契约矩阵

本矩阵是前端页面进入开发的前置门禁。`operationId`、请求/响应 Schema、错误码、权限和 Mock 未确定的操作不得接入真实页面。

| 页面/闭环 | 操作 | 当前契约 | 当前判断 | 开发门禁 |
|---|---|---|---|---|
| 客户账户 | 查询本人和账户 | `customer-api.yaml` | 已有基础 | 核对实现响应与前端模型 |
| 客户转账 | 创建、列表、详情、回单 | `customer-api.yaml` | 五页范围已覆盖 | 运行发布级角色、幂等与金融 E2E |
| 客户贷款 | 申请、提交、核心处理、还款、关闭 | `customer-api.yaml` | 已有主要路径 | 补齐查询、文档与状态枚举 |
| 客户资料 | 收款人、通知、对账单 | `customer-api.yaml` | 收款人可执行化已完成，其余已有基础 | 后续补齐非首批页面分页与错误模型 |
| 运营支付 | 创建、列表、详情、冲正、审批 | `operations-api.yaml` | 五页读模型已覆盖 | 后续补齐非首批冲正/审批页面契约测试 |
| 运营贷款/风险 | 评分、批准、风险决策 | 未完整声明 | 缺口 | 完成 OpenAPI 后才能重构交互 |
| 清算/对账/日终 | 触发、查询最新结果 | 未完整声明 | 缺口 | 明确内部/运营边界与错误码 |
| 测试支撑 | Fixture、断言、业务日期 | `test-support-api.yaml` | 基础较完整 | 保持 local/test 与角色限制 |
| 衡准观测（暂缓） | 运行、失败、证据、环境、发布质量 | `quality-platform-api.yaml`（只读草案） | `HZ-OBSERVABILITY-001` 为 `BLOCKED`；既有前端不构成当前能力 | 恢复后只实现只读投影；案例、基线、知识、调度、恢复和脚本写操作只经 Coze + Harness |

## 首批五页面实现结论

| 页面 | 当前前端调用 | 当前后端事实 | 实现结论 |
|---|---|---|---|
| 转账列表 | `GET /api/customer/v1/transfers` | subject-scoped 分页 Controller 与 OpenAPI 已实现 | 已接入生成客户端和服务端状态筛选 |
| 新建转账 | `POST /api/customer/v1/transfers` | 受益人核心引用解析、账户 ownership、16–128 位幂等键已实现 | 已使用 `beneficiaryId` 和 `transferId` |
| 转账结果 | `GET /api/customer/v1/transfers/{transferId}` | 客户详情与回单接口已具备 | 已按真实 12 态轮询，终态停止 |
| 支付监控 | `GET /api/operations/v1/transfers?status=` | 分页列表 Controller 与 OpenAPI 已实现 | 已接入筛选、统计和详情导航 |
| 支付详情 | `GET /api/operations/v1/transfers/{transferId}` | 状态历史、Outbox 安全元数据和审计数量已组合 | 已按安全边界展示，不返回 payload/headers |

完整 Actual-Target-Decision 与 36 个 PV 状态见 [`transfer-five-page-bidirectional-adjustment.md`](transfer-five-page-bidirectional-adjustment.md)。

## 每行最终必须补齐的字段

`route`、`action`、`operationId`、`requestSchema`、`responseSchema`、`problemCodes`、`role`、`idempotency`、`mockFixture`、`backendStatus`、`contractTest`、`playwrightCase`。

前端 TypeScript 类型与 API Client 必须由 OpenAPI 生成；不再新增手写字符串接口路径和重复 DTO。
