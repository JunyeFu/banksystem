---
id: DOC-FE-SHELLS
title: 前端壳层导航与路由
document_type: reference
domain: frontend
status: accepted
authority: normative
version: 1.4
effective_date: 2026-07-20
owner: project-owner
---

# 前端壳层、导航与路由

## 壳层

| 壳层 | 范围 | 规则 |
|---|---|---|
| 客户银行端 | `/portal/*` | 白色顶部导航、1200px 内容区、中等密度 |
| 运营管理端 | `/ops/*` | 墨黑侧栏、白色工具栏、中高密度 |
| 衡准平台 | `/quality/*` | 暂缓；既有路由在恢复实施后仅可作为只读指标与证据观测视图 |
| 登录/外部管理 | 登录、Mifos X、Keycloak、Grafana | 保留各系统功能和权限，不新增 Gateway UI |

## 登录入口边界

- `/portal/login` 仅服务客户：账号密码和统一身份认证均使用 `bank-customer` Realm、`customer-portal` Client，并回到 `/portal/*`；页面不得出现员工或运营后台入口语义。
- `/ops/login` 仅服务员工：统一身份认证使用 `bank-internal` Realm、`operations-console` Client，并回到 `/ops/*`。
- 两个入口不得共享 PKCE 会话键、回调地址或访问令牌，也不得在认证成功后跨壳层跳转。

### 客户账户与角色链路

- 客户账户必须创建在 `bank-customer` Realm；`bank-internal` 中的员工账户不能作为客户账户使用，也不能跨 Realm 迁移密码凭据。
- 管理后台创建客户时必须填写用户名、姓名和有效邮箱，启用账户并正确处理必需操作；只设置用户名和密码会被 Keycloak 判定为“账户资料未完成”。
- `CUSTOMER` 是门户基础领域角色，并作为 `bank-customer` 的默认角色自动授予新建客户；它进入访问令牌的 `realm_access.roles`，由渠道服务转换为 `ROLE_CUSTOMER`。
- `CUSTOMER_MFA_VERIFIED` 只用于新增收款人、发起转账等增强验证操作，不得作为默认角色；只有完成真实增强验证或受控演示授权后才能授予。
- `CUSTOMER_BLOCKED` 表示阻断状态，不是门户访问许可，不能替代 `CUSTOMER`。
- 完成身份认证不等于完成银行业务开户。可访问账户、贷款和交易数据之前，还必须在渠道服务的 `customer_identity` 中将 Keycloak 用户 `sub` 绑定到核心银行客户编号；该绑定应由受控开户/运维流程完成，不能由浏览器自行提交。

### 客户账号密码登录约束

- `/portal/login` 的账号密码模式是本机演示兼容路径：浏览器将用户名和密码提交给 `bank-customer` 的 `customer-portal` Public Client，Keycloak 必须只在本机演示配置中启用 Direct Access Grant。
- 生产或外网部署不得沿用密码授权模式；目标认证方式是 Authorization Code + PKCE，并由 Keycloak 承载必需操作、MFA、条件认证和凭据恢复。
- 当前“用户名/手机号”只有用户名链路具备实现证据。手机号只有在定义唯一属性、规范化、重复号处理、查找/认证器和契约测试后才能标记为可用；在此之前不得用页面文案代替能力证据。
- 门户不得持久化用户名、密码或 Access Token。会话刷新、令牌过期、退出和 401 回登录必须按独立会话策略验收。
- 持久演示客户的最终验收必须由用户在图形界面亲自输入密码；自动化和证据不得读取、回显或保存密码、令牌、Cookie 或浏览器状态。
- 在线开户注册和忘记密码不是账号密码登录的隐含组成部分；在独立开户/恢复任务完成前必须显示为不可提交的演示说明。

当前实现差距与完成判定见 [`../../evidence/frontend/customer-password-login-gap-2026-07-16.md`](../../evidence/frontend/customer-password-login-gap-2026-07-16.md)。

## 当前客户路由

`/portal/dashboard`、`/portal/accounts`、`/portal/accounts/:accountId`、`/portal/transfers`、`/portal/transfers/new`、`/portal/transfers/:transferId`、`/portal/beneficiaries`、`/portal/loans`、`/portal/loans/apply`、`/portal/loans/:loanId`、`/portal/documents`、`/portal/messages`、`/portal/profile`、`/portal/security`。

## 当前运营路由

`/ops/dashboard`、`/ops/payments`、`/ops/payments/:transferId`、`/ops/risk/alerts`、`/ops/risk/cases`、`/ops/approvals`、`/ops/clearing`、`/ops/reconciliation`、`/ops/eod`、`/ops/documents`、`/ops/audit`、`/ops/system-health`、`/ops/external`。

## 当前衡准路由

`/quality/dashboard`、`/quality/cases`、`/quality/cases/:caseId`、`/quality/baselines`、`/quality/runs`、`/quality/schedules`、`/quality/incidents`、`/quality/knowledge`、`/quality/releases` 保留为未来只读路由；当前实现暂停。恢复后它们只消费只读观测契约，不以浏览器夹具代替生产后端实现，也不提供 Agent 平台支持或写控制。

路由、权限、字段和业务状态不得仅因视觉稿存在而新增。衡准路由仅在项目负责人恢复 `HZ-OBSERVABILITY-001` 后才进入实施。
