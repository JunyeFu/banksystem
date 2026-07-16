---
id: DOC-EVIDENCE-CUSTOMER-PASSWORD-LOGIN-GAP-20260716
title: 客户门户图形化账号密码登录缺口（2026-07-16）
document_type: report
domain: evidence
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-16
owner: project-owner
---

# 客户门户图形化账号密码登录缺口（2026-07-16）

## 目标边界

本缺口只处理本机演示环境中的客户门户登录：用户在 `/portal/login` 图形界面输入客户用户名和密码，由 `bank-customer` Realm 的 `customer-portal` Client 完成认证，随后进入 `/portal/*` 并读取本人核心银行数据。

员工统一身份认证、运营后台登录、在线开户注册、生产互联网认证方案不属于本缺口。生产或外网环境不得把密码授权模式作为目标认证方案；应使用 Authorization Code + PKCE、受控会话和增强认证。

## 当前已实现与已验证事实

| 链路 | 当前事实 | 判断 |
|---|---|---|
| 门户图形界面 | `Login.tsx` 已提供用户名/手机号、密码输入框和“账号密码登录”按钮，密码提交后会清空 | 已实现 |
| 身份服务调用 | 门户向 `bank-customer` 的 Token Endpoint 提交 `grant_type=password`，Client 为 `customer-portal` | 已实现，仅限本机演示 |
| Keycloak Client | `customer-portal` 是 Public Client，已启用 Standard Flow 与 Direct Access Grants，并允许 `127.0.0.1:18082` 来源和回调 | 已配置 |
| 领域角色 | `CUSTOMER` 已作为 `bank-customer` 默认角色；`CUSTOMER_MFA_VERIFIED` 与 `CUSTOMER_BLOCKED` 不作为基础登录许可 | 已配置 |
| 核心身份映射 | Keycloak `sub` 必须显式关联渠道库 `customer_identity` 和唯一 Fineract 客户 | 架构正确，演示账号需逐一准备 |
| 图形化冒烟 | 临时合成客户曾通过门户账号密码表单进入 Dashboard，并完成个人资料/账户链路验证；临时身份与映射已清理 | 证明代码链可用，不等于持久演示账号已验收 |
| 当前运行态 | Keycloak OIDC Discovery 与 `/portal/login` 当前均返回 HTTP 200 | 服务可达 |

## 缺口清单

| ID | 优先级 | 缺口 | 影响 | 完成判定 |
|---|---|---|---|---|
| AUTH-GAP-01 | P0 | 持久演示客户尚缺少一次由用户掌握密码完成的图形化联合验收记录 | 无法证明实际交付给演示者的账号可从门户表单稳定登录 | 在 Keycloak `bank-customer` 中为持久客户设置非临时密码；该客户具备 `CUSTOMER` 且已建立唯一核心映射；用户在门户亲自输入密码后进入 Dashboard，账户接口返回本人数据；证据不得记录用户名、密码、令牌或个人信息 |
| AUTH-GAP-02 | P0 | 账号创建、角色授予、核心客户映射和验收仍是分散的人工步骤，没有幂等、脱敏的演示身份准备流程 | 容器重建或换机后容易再次出现“认证成功但业务 404” | 提供受控的本地准备命令或运维步骤，能检查 Realm、用户启用状态、`CUSTOMER`、必需操作和唯一 `customer_identity` 映射；不得生成、读取或输出密码 |
| AUTH-GAP-03 | P1 | 页面声明“用户名/手机号”，当前实现只是把输入原样作为 Keycloak `username` 提交，未建立手机号属性、唯一性、查找或认证器契约 | 真实手机号登录不可保证，文案可能误导验收 | 二选一并固化：实现受控手机号登录契约及重复号处理，或在实现前把字段和错误文案收敛为“用户名” |
| AUTH-GAP-04 | P1 | 账号密码模式仅保存内存 Access Token，没有 Refresh Token 续期和页面刷新恢复策略 | 页面刷新即丢失登录状态，长时演示会话不可重复 | 明确本地演示会话策略；在不把令牌写入不安全持久存储的前提下完成刷新、过期、退出和 401 回登录验收 |
| AUTH-GAP-05 | P1 | Direct Access Grant/ROPC 无法承载浏览器重定向认证中的必需操作、复杂 MFA 和条件认证，且不应成为生产目标 | 若误标为生产就绪，会绕开应由 Keycloak 承载的认证交互 | 文档、配置和验收明确其仅为本机演示兼容路径；统一身份认证继续使用 Authorization Code + PKCE；生产门禁禁止启用密码授权 |
| AUTH-GAP-06 | P2 | “注册账号”和“忘记密码”尚非真实闭环；Realm 当前不开放自助注册，重置密码能力也未形成验收契约 | 用户可能把占位入口理解为可用功能 | 保持明确的演示占位提示，或在独立任务中实现开户、凭据恢复、审计与防滥用；不得把两项计入本次登录完成度 |
| AUTH-GAP-07 | P2 | 登录错误统一折叠为非敏感提示，但缺少可关联的脱敏诊断证据 | 出现配置、CORS、账号状态或核心映射问题时定位成本高 | 浏览器只显示非枚举式提示；服务端/验收证据记录时间、阶段、HTTP 状态和关联 ID，不记录密码、令牌或用户个人信息 |

## 本缺口修复步骤（非项目实施顺序）

以下编号只约束本缺口内部操作，不改变项目唯一开发顺序；项目级先后关系见 [`../../../agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md)。

1. 完成 `AUTH-GAP-01`：由用户在 Keycloak 图形界面设置持久客户密码，再在门户图形界面输入同一凭据完成验收。
2. 完成 `AUTH-GAP-02`：固化不接触密码的身份、角色与核心映射准备流程，并执行重启后复验。
3. 决定 `AUTH-GAP-03` 的手机号策略；未实现前不得把手机号登录标记为已验证。
4. 补齐 `AUTH-GAP-04` 与 `AUTH-GAP-07` 的会话和诊断门禁。
5. 保持 `AUTH-GAP-05` 的环境隔离；`AUTH-GAP-06` 作为独立后续能力。

## 本次图形化联调验收标准

- 浏览器地址始终从 `http://127.0.0.1:18082/portal/login` 开始，不要求跳转到 Keycloak 登录页。
- 使用 `bank-customer` 中已启用、无未完成必需操作、具备 `CUSTOMER` 的持久演示客户。
- 用户亲自输入用户名和密码；自动化、日志和文档均不读取或保存密码。
- 登录后进入 `/portal/dashboard`，刷新前可访问 `/portal/accounts`，且只返回该身份绑定的核心客户数据。
- 错误凭据仅得到非枚举式失败提示；失败后密码输入框被清空。
- 统一身份认证入口仍能独立走 Authorization Code + PKCE，且不得跳到运营后台。
- 形成脱敏验收记录：时间、入口、Realm、Client、角色检查、核心映射检查、目标路由、HTTP/页面结果；`changed_files` 不包含 `.env`、令牌、Cookie、浏览器状态或凭据。

## 状态结论

门户账号密码登录代码链和 Keycloak 基础配置已经具备，临时合成客户也证明过链路可工作；但在 `AUTH-GAP-01` 和 `AUTH-GAP-02` 完成前，只能标记为 `PARTIALLY_VERIFIED`，不能宣称“持久演示账号已可重复图形化登录”，更不能宣称生产认证就绪。
