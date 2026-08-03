---
id: DOC-STATE-CODE-ARCHAEOLOGY
title: 当前代码考古事实
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前代码考古事实

本文件由源码静态扫描和现有构建/合同文件交叉核对形成。它记录“代码声明了什么”，不把静态注册、历史证书或进程存在误写成运行时成功。

## 可复现数量

| 范围 | 结果 | 证据 |
|---|---:|---|
| 银行 Channel HTTP 映射注解 | 75 | `services/bank-channel-service/src/main/java/**/*.java` |
| 衡准 MCP 注册工具 | 33 | `platform/hengzhun-regression-system/mcp/src/server.cjs` |
| Harness SQLite 迁移 | 036 | `platform/hengzhun-regression-system/harness/migrations` |
| Harness 迁移中唯一表名 | 84 | `CREATE TABLE` 静态提取 |
| 前端应用 | 3 | `apps/customer-portal`、`apps/operations-console`、`apps/quality-case-portal` |
| 共享前端包 | 3 | `packages/bank-api-client`、`bank-domain-types`、`bank-ui-kit` |

## 银行 Channel

### 模块与数据归属

- `bank.identity`：客户账户、当前客户、资料、安全设置、贷款和文档读取；本地只维护 `channel.customer_identity` 映射，账务账户读取 Fineract。
- `bank.customer-profile`：贷款申请、评分、审批、核心提交、还款和关闭；拥有 `channel.loan_application`、`channel.loan_approval`。
- `bank.accounts`：运营账户生命周期和柜员查询；账户事实来自 Fineract，当前归属标记为 `INFERRED`，迁移前需用运行数据库确认。
- `bank.beneficiaries`：收款人创建与查询；拥有 `channel.beneficiary`。
- `bank.payments`：客户/运营转账、回执、冲正、清算、日终和内部处理；拥有 transfer、receipt、reversal、clearing、EOD、outbox、ledger、idempotency 相关表。
- `bank.risk`：风险告警、案件、评估和审批；拥有 `channel.risk_decision`。
- `bank.notifications`：通知、已读和账单/流水读取；拥有 `channel.notification`，账务流水仍由 Fineract 提供。
- `bank.documents`：客户贷款文档和运营文档；拥有 `channel.loan_document`、`channel.operations_document`。
- `bank.reconciliation`：对账运行与结果；拥有 `channel.reconciliation_run`。
- `bank.audit`：监控、审计查询和链完整性检查；拥有 `channel.security_audit_event` 与死信事件读取。
- `bank.operations`：运营总览和外部服务总览；当前是跨域只读聚合，不拥有业务表。
- `bank.test-support`：仅本地测试夹具、场景初始化和断言接口；不得写 Fineract 数据库，调用 Channel/Fineract 合同完成夹具。

公开路径、状态和依赖以 [`module-boundaries-v1.yaml`](../architecture/refactoring/module-boundaries-v1.yaml) 为机器权威。

## 衡准回归系统

- `hengzhun.flowise`：Flowise 应用和 Agentflow 制品，当前静态入口为 `flowise/i10/agentflow-v7.json`；运行时数据库由 Flowise 自己拥有，实际版本仍需 LIVE 检查。
- `hengzhun.harness`：健康端点、I10 Journey/凭据/TargetProfile、I8 作者化/执行/调度/修复和插件兼容端点；拥有全部衡准 SQLite 迁移表。
- `hengzhun.mcp`：33 个显式工具注册，负责将 Flowise 调用转换为 Harness 合同，不直接拥有业务数据。
- `hengzhun.worker`：轮询 Harness 的受管内部队列，执行 OCR、Midscene 定位、Playwright、稳定性和修复任务；不拥有持久化业务表。
- `hengzhun.contracts`：OpenAPI、JSON Schema 和接口合同制品。
- `hengzhun.tests`：兼容套件、I10 合同/状态测试和全量测试入口。

调用方向固定为：`Flowise → MCP → Harness(SQLite) → Worker → 浏览器/模型 → Harness → MCP → Flowise`。

## 前端应用与共享包

- 客户门户 `/portal`：登录、概览、账户、转账、验证、单号查询、收款人、贷款、文档、消息、个人资料和安全设置。
- 运营控制台 `/ops`：登录、概览、系统健康、支付、清算、对账、审批、风险、日终、文档、审计和外部服务。
- 衡准观测门户 `/quality`：总览、用例、基线、运行、定时、失败恢复、知识作者化和交付。
- 共享包：`bank-api-client` 提供 API 客户端，`bank-domain-types` 提供 TypeScript 合同，`bank-ui-kit` 提供品牌和 UI 主题。

## 仍需运行态确认的事项

代码考古不能替代运行验收，以下项目保持阻断状态：

1. Channel Liquibase 实际版本、PostgreSQL 实际表结构和各表写入方。
2. Harness SQLite 实际迁移版本是否达到 036。
3. 当前进程是否加载了本次源码、Agentflow 版本和内容 Hash 是否一致。
4. Flowise 数据库中实际部署图是否与 `agentflow-v7.json` 一致。
5. MCP 33 工具的真实可达性、Worker 令牌配置和模型探针结果。
6. 客户门户、运营控制台和衡准门户的 LIVE_E2E 证据。

这些项目必须由 RF-001 的 LIVE 基线任务采集后，才允许进入业务代码重构批次。静态事实已补齐，不代表运行态已通过。
