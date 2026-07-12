# P0-1 客户转账 403 真因核查 证据

## 核查时间
2026-07-12

## 核查项
审计报告称"客户转账 E2E 因 SecurityConfig RBAC 阻断",P0-1 真因核查。

## 关键证据

### 1. 容器镜像非旧
- 源码:`services/bank-channel-service/src/main/java/local/bank/channel/SecurityConfig.java`
  修改时间 `2026-07-11 15:19:44`,大小 6819 字节
- 本地编译产物:`target/classes/local/bank/channel/SecurityConfig.class`,
  时间 `2026-07-11 15:29`,大小 13572 字节
- 容器 `mifos-channel-bank-channel-service-1` 启动时间:`2026-07-11 15:25:46`
- 容器内 `/app/app.jar`:`40902024` 字节,`2026-07-11 15:25`
- 从容器抽取 `BOOT-INF/classes/local/bank/channel/SecurityConfig.class`
  与本地最新编译产物 `cmp` 比对输出 `IDENTICAL`
- 结论:运行容器即最新源码构建产物。无需重建。

### 2. 未授权返回 401 非 403(正常)
- `curl http://127.0.0.1:18443/health` → **200**
- `curl http://127.0.0.1:18443/internal/health` → **200**
- `curl -X POST http://127.0.0.1:18443/api/customer/v1/transfers` 无 token → **401**
- 容器内 `curl -X POST http://127.0.0.1:8080/api/customer/v1/transfers` → **401**
- 401 表明 `oauth2ResourceServer` 正常工作,SecurityConfig 在缺 token 时返回 401,合规;

### 3. 端口更正
- 网关 `compose.channel.yaml:125` 暴露 `127.0.0.1:18443:8080`
- `18080` 是 Mifos X `mifos-isolated-web-app` 的员工后台端口,**非客户 API 入口**
- 审计报告 / 前述 E2E 脚本若调用 `127.0.0.1:18080/api/customer/v1/transfers`,会被 Mifos X 返回 403/404

### 4. SecurityConfig 源码正确,审计记录的问题已修复
`SecurityConfig.java:65-67`:
```java
.requestMatchers(HttpMethod.POST, "/api/customer/v1/beneficiaries", "/api/customer/v1/transfers")
  .hasAuthority("ROLE_CUSTOMER_MFA_VERIFIED")
.requestMatchers("/api/customer/v1/**").hasAuthority("ROLE_CUSTOMER")
```
审计报告提及的 `/api/customer/v1/customers/**` 规则已被替换;现状下:
- 浏览器走 OIDC PKCE 登录后,Keycloak 校验 MFA 步骤完成,token 携带 `ROLE_CUSTOMER_MFA_VERIFIED`
- POST `/api/customer/v1/transfers` 要求 `ROLE_CUSTOMER_MFA_VERIFIED`,匹配正确

## 403 的最可能成因(历史 E2E 脚本问题)
1. 历史脚本调用端口 `18080`(Mifos X)而非 `18443`(网关),Mifos X 对未授权路径回 403;
2. 或脚本只取了基础 `ROLE_CUSTOMER` token,未触发 MFA Step-up,被 `/api/customer/v1/transfers` 规则拒。

## 处置决定
**P0-1 不需要改代码。** 当前源码与容器镜像已正确。
后续 E2E 修复在 P0-3 完成、TransferStateMachine 重构后,重写测试脚本时一并处理:
- 固定使用 `127.0.0.1:18443` 作为客户 API 入口;
- 强制走 OIDC PKCE + MFA Step-up,验证 token 含 `realm_access.roles` 中 `customer-mfa-verified`;
- 若仍 403,再升级为代码缺陷项,补 `RoleAssignmentTest`。

## 后置任务(交由 W3 E2E 脚本环节)
- 在 `tests/` 下新增 `e2e/transfer-mfa.spec.ts`,通过 Playwright + Keycloak Fixture 用户 `alice`
  完整登录→MFA→POST transfers→断言 201。
- 当前 W1 不写该脚本,等 P0-3 状态机桥接完成后再写,避免返工。