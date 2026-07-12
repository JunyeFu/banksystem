# S0-S7 验收修复记录

Date: 2026-07-11
Status: REMEDIATION IN PROGRESS

## 修复清单

### P0 阻断项（已修复）

| ID | 问题 | 修复 |
|---|---|---|
| P0-1 | Test Support @PreAuthorize 未生效 | SecurityConfig 添加 @EnableMethodSecurity；添加 URL 规则 `/internal/test-support/**` 需 ROLE_TEST_SUPPORT；bank-internal-realm 添加 TEST_SUPPORT 角色 |
| P0-2 | 运行容器与 v4 源码不一致 | compose.channel.yaml 已更新为新服务名和端口；待重建部署 |

### P1 阻断项（已修复）

| ID | 问题 | 修复 |
|---|---|---|
| P1-1 | E2E 断言 POSTED，代码写 SETTLED | 所有 .ps1 脚本更新为 SETTLED 和 v4 端口 (18443/19000) |
| P1-2 | ReconciliationService 检查 POSTED | 改为 SETTLED，CHANNEL_TO_CLEARING 检查 SETTLED/REVERSED |
| P1-3 | Mock Clearing 两套不一致 | MockClearingService.java 扩展为 v4 8 场景 |
| P1-4 | EOD 仅记录结果 | EodController 注入 ReconciliationService，执行 3 类对账 + 审计检查点 |
| P1-5 | OutboxPublisher 仅标记已发布 | 添加 attempt_count/next_attempt_at，重试 5 次后写入 DLQ |
| P1-6 | 前端大量占位页 | Customer Portal 新增 5 页（TransferCreate, AccountDetail, TransferResult, Beneficiaries, LoanApply）；Operations Console 新增 4 页（PaymentDetail, Reconciliation, EOD, RiskCases） |
| P1-7 | bank-channel-service 直接暴露主机端口 | 移除 ports 映射，仅通过 Gateway 访问 |
| P1-8 | 恢复演练仅检查表数量 | 添加不变量验证：状态合法性、审计哈希、外键完整性、幂等去重、核心客户/账户/贷款计数、日记账余额 |

### P2 修复项（已修复）

| ID | 问题 | 修复 |
|---|---|---|
| P2-1 | Catalog 仅覆盖 6 页 | 扩展为 15 页，pageId/testId 与 React 源码匹配 |
| P2-2 | Seed 不返回运行时 ID | seed 创建 customer_identity 记录，返回 subject 和 fineractClientId |
| P2-3 | assertLedger 查询不存在的 ledger_entry 表 | 改为通过 FineractAdapter.journalEntries() 查询核心日记账 |

## 待完成步骤

1. **FIX-P0-2**: 重建并部署所有容器
   - `docker compose -f compose.channel.yaml down`
   - `pwsh scripts/deploy/generate-secrets.ps1`
   - `docker compose -f compose.channel.yaml build`
   - `docker compose -f compose.channel.yaml up -d`
   - 验证所有服务健康

2. **运行测试**:
   - 验证 Gateway 18443 可访问
   - 验证 Keycloak 19000 可访问
   - 验证 Customer Portal 18082 可访问
   - 验证 Operations Console 18083 可访问
   - 验证 bank-channel-service 不可直接访问（无 18100 端口）
   - 验证 Test Support 需要 TEST_SUPPORT 角色
   - 运行 E2E 测试脚本（更新后端口和状态）
   - 运行恢复演练（含不变量验证）

3. **复验**: 所有 MUST 项通过后更新本文件为 PASS
