---
id: DOC-EVIDENCE-FE-DEFECT-INVENTORY-20260715
title: 前端真实运行缺陷盘点（2026-07-15）
document_type: report
domain: evidence
status: verified
authority: evidence
version: 1.3
effective_date: 2026-07-15
owner: project-owner
---

# 前端真实运行缺陷盘点（2026-07-15）

> 排期说明（2026-07-16）：本文件是历史取证，不是实施顺序权威。原“完成 FE-DEFECT-003/004/005 后再启动 Coze/Harness”的全局门槛已被 [`../../../agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md) 覆盖。平台基础立即开工，银行前端只按首批案例设置案例级门禁。

## 结论

客户门户与运营控制台的 React 壳层、路由和页面错误态均可渲染。第一轮根因已确认：生产静态 Nginx 未将 `/api/` 转发至网关，且客户门户 OIDC issuer/client 配置错误、运营控制台缺少认证入口。上述边界已修复；未携带令牌的真实请求现稳定返回 401，两个门户会先跳转至对应的本机 OIDC 登录页。

最紧急的安全缺陷——运营端无法读取日终状态时仍可启用“启动日终处理”——已改为失败闭锁，并有浏览器视觉回归覆盖。尚不能据此宣称客户或运营数据页在“已认证演示会话”下已全部恢复：本轮不读取、不创建、不使用任何账户凭据，故业务角色、合成数据准备与下游契约响应仍需在授权会话下验收。

本报告记录取证与第一轮修复证据；不启动 Coze、Harness 或衡准实现。

## 2026-07-16 真实认证会话增量结论

- `GET /api/customer/v1/accounts` 与 `GET /api/customer/v1/loans` 的 404 已确认不是路由缺失，而是登录主体未写入渠道自有的 `customer_identity` 映射。此前合成账号 E2E 会临时建立映射并在结束后清理，不能作为新建 Keycloak 用户已经可查询核心账户的证据。
- `GET /api/customer/v1/transfers` 的 500 已通过相同 SQL 在 PostgreSQL 中复现：历史 Liquibase 变更集的重复 YAML 键使 `transfer_receipt.transfer_id` 实际成为 `char(64)`，而 `transfer_order.transfer_id` 为 `uuid`。
- V8 迁移负责在启动前验证 UUID 格式、孤儿引用和重复引用，再转换字段类型并恢复唯一约束与外键；历史已执行变更集保持不变，避免 Liquibase 校验和漂移。
- Keycloak 原 Compose 未挂载数据卷，容器重建会丢失后台手工用户。现已增加命名数据卷；本次重建前创建的用户仍需一次性恢复，之后重建不应再丢失。
- 详细证据与剩余人工步骤见 [`customer-live-read-remediation-2026-07-16.md`](customer-live-read-remediation-2026-07-16.md)。

## 范围和方法

- 运行入口：`http://127.0.0.1:18082/portal`、`http://127.0.0.1:18083/ops`。
- 浏览器：本机 Codex 内部浏览器；使用既有本地演示会话，不读取会话凭据、令牌或个人数据。
- 前端实际接口前缀：客户门户为 `/api/customer/v1`，运营控制台为 `/api/operations/v1`；两者 Vite 开发代理均配置为 `http://127.0.0.1:18443`。
- 取证方式：页面可访问性树、可见错误态、错误态重试交互、源码分支和自动化测试代码审阅。
- 限制：未输出或读取认证信息；未执行任何资金、日终、审批或其他写操作。`/actuator/health` 返回 404，不能据此判定网关或下游服务的具体根因。

## 已验证的运行事实

| 页面 | 真实结果 | 重试结果 | 判定 |
|---|---|---|---|
| 客户门户 `/portal/dashboard` | 未认证时跳转 `/portal/login` | 登录页可渲染，无控制台错误 | 已修复入口保护；认证后数据待验收 |
| 客户门户 `/portal/security` | 安全设置错误态补充重试与无敏感恢复提示 | 可重试 | 已修复恢复入口；认证后数据待验收 |
| 客户门户 `/portal/transfers` | 未认证时跳转 `/portal/login` | 登录页可渲染，无控制台错误 | 已修复入口保护；认证后数据待验收 |
| 运营控制台 `/ops/eod` | 未认证时跳转 `/ops/login` | 登录页可渲染；读取失败时启动入口禁用 | P0 失败闭锁已修复；认证后数据待验收 |
| 运营控制台 `/ops/payments` | 未认证时跳转 `/ops/login` | 登录页可渲染，无控制台错误 | 已修复入口保护；认证后数据待验收 |

直接请求 `18082/api/customer/v1/accounts` 与 `18083/api/operations/v1/eod/latest` 均返回 401，而不是静态 Nginx 404；因此前端到网关的转发已生效，授权边界也由服务端执行。客户和内部 realm 的 OIDC discovery issuer/authorization endpoint 均与前端配置一致。

## 源码与测试覆盖差距

1. `apps/operations-console/src/pages/EOD.tsx` 已要求获得权威状态后才能启动或确认执行；读取失败、加载中和未返回状态均禁用写入口。
2. `apps/customer-portal/src/pages/SecuritySettings.tsx` 已提供重试与不暴露敏感信息的恢复提示。
3. 两个门户均增加 OIDC 登录入口、受保护路由和退出登录；生产构建不包含测试绕过。视觉套件仅通过显式 `VITE_E2E_AUTH_BYPASS=true` 的测试服务器保持既有 mock 场景可回归。
4. 已接通既有页面和既有契约支持的交互：收款人携带 `beneficiaryId` 进入并预选转账、个人资料安全/消息入口、运营待办进入审批队列、风险案件和风险告警只读详情、告警级别筛选。没有对应写契约的资料修改与风险处置仍明确受限，避免展示页面伪造业务能力。
5. 客户安全设置中的可用分类现在跳转至对应页面；身份服务专属入口给出明确、可关闭的管理说明，不再出现无反馈的展示按钮。
6. 现有 Playwright 视觉套件仍普遍使用 `page.route` 模拟接口响应；缺少不 mock 的已认证本机烟测，故不能证明角色映射、演示数据和下游读契约完整可用。
7. 两个生产构建仍报告单一 JavaScript chunk 超过 500 kB：客户门户 1,256.15 kB，运营控制台 1,326.46 kB（均为压缩前）。这不是当前可用性阻塞项，但不符合可持续的前端性能预算。

## 缺陷及修复顺序

| 编号 | 优先级 | 修复目标 | 完成判定 |
|---|---|---|---|
| FE-DEFECT-002 | P0 | 日终读状态失败时失败闭锁 | 已实现并通过 mocked 浏览器失败分支；仍需已认证本机烟测补充运行态证据 |
| FE-DEFECT-003 | P0 | 客户门户真实读通路恢复 | dashboard、security、transfers 在已认证本机演示会话中获得受契约约束的有效响应；失败可重试且有可诊断的用户反馈 |
| FE-DEFECT-004 | P0 | 运营控制台真实读通路恢复 | EOD、payments 在同一演示环境中获得有效响应；不将根因掩盖为“空数据” |
| FE-DEFECT-005 | P1 | 建立真实联调健康门禁 | 不使用 `page.route` 的最小本机冒烟用例覆盖客户与运营读通路、授权失败、重试和日终失败闭锁；失败产生安全脱敏证据 |
| FE-DEFECT-006 | P2 | 性能预算与拆包 | 设定并验证可接受的初始 JS 预算，必要时按路由拆包；不改变银行业务语义 |

本报告形成时的前端内部修复优先级仍可用于 `FE-DEFECT-001` 自身收尾，但不得作为 Coze/Harness 平台基础的全局前置条件。首批案例只依赖其实际经过的客户门户路径；FE-DEFECT-004、FE-DEFECT-006 和其他未使用页面继续并行或后置。

## 已执行验证

- `npm.cmd run build`：`apps/customer-portal` 通过。
- `npm.cmd run build`：`apps/operations-console` 通过。
- `npm.cmd test`：`tests/e2e/frontend-operations-settlement` 29/29 通过，含“日终状态读取失败即禁止启动”用例。
- `npm.cmd test`：`tests/e2e/frontend-customer-core` 19/19 通过。
- `npm.cmd test`：`tests/e2e/frontend-customer-experience` 30/30 通过。
- `npm.cmd test`：`tests/e2e/frontend-operations-risk` 19/19 通过；PV-0098 在新增退出登录后的视觉基线经人工核对后更新。
- `npm.cmd test`：`tests/e2e/frontend-operations-dashboard` 11/11 通过。
- `npm.cmd test`：其余预览/交互套件全部通过：转账 40/40、运营审批 28/28、运营治理 34/34、外部管理 5/5、衡准演示 15/15。与前述套件合计 10 个套件、230 项通过，覆盖 PV-0001 至 PV-0201。
- 后续增量回归：客户体验 31/31（含安全设置管理说明和收款人预选），运营风险 21/21（含告警详情和级别筛选）。
- 本机浏览器：直达 `/portal/dashboard` 重定向至 `/portal/login`；直达 `/ops/eod` 重定向至 `/ops/login`；两个页面无相关控制台 error/warn。
- 本机运行态：两条未认证 API 路径均为 401；两个 OIDC discovery endpoint 可用且与对应 realm 匹配。
- 本机无凭据联调门禁：`scripts/verify-frontend-live-smoke.ps1` 通过，覆盖网关健康、客户/运营登录页、OIDC discovery 与未认证 API 保护；不读取或发送令牌。
