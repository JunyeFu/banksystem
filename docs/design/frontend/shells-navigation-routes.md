---
id: DOC-FE-SHELLS
title: 前端壳层导航与路由
document_type: reference
domain: frontend
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 前端壳层、导航与路由

## 壳层

| 壳层 | 范围 | 规则 |
|---|---|---|
| 客户银行端 | `/portal/*` | 白色顶部导航、1200px 内容区、中等密度 |
| 运营管理端 | `/ops/*` | 墨黑侧栏、白色工具栏、中高密度 |
| 衡准平台 | `/quality/*`（目标） | 独立平台壳层，未实现前不得声称存在 |
| 登录/外部管理 | 登录、Mifos X、Keycloak、Grafana | 保留各系统功能和权限，不新增 Gateway UI |

## 当前客户路由

`/portal/dashboard`、`/portal/accounts`、`/portal/accounts/:accountId`、`/portal/transfers`、`/portal/transfers/new`、`/portal/transfers/:transferId`、`/portal/beneficiaries`、`/portal/loans`、`/portal/loans/apply`、`/portal/loans/:loanId`、`/portal/documents`、`/portal/messages`、`/portal/profile`、`/portal/security`。

## 当前运营路由

`/ops/dashboard`、`/ops/payments`、`/ops/payments/:transferId`、`/ops/risk/alerts`、`/ops/risk/cases`、`/ops/approvals`、`/ops/clearing`、`/ops/reconciliation`、`/ops/eod`、`/ops/documents`、`/ops/audit`、`/ops/system-health`。

路由、权限、字段和业务状态不得仅因视觉稿存在而新增。衡准平台路由必须在对应 OpenAPI、页面设计和实现批次共同批准后建立。
