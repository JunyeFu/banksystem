---
id: DOC-2F44A671F7
title: V4 银行业务系统与 v5.4 回归平台兼容基线
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# V4 银行业务系统与 v5.4 回归平台兼容基线

> 状态：V4 落地调整基线
> 更新：2026-07-14
> 适用范围：V4 银行业务目标系统、外网演示版、后续公司内网迁移
> 上游方案：`_implementation_plan/Apache_Fineract_Mifos_Agent_Implementation_Plan.md`

## 1. 目标

V4 不再只是“能运行的数字银行沙箱”。V4 落地后必须成为 v5.4 完整回归测试平台的稳定被测目标系统，能够被人工操作、被案例复刻、被 Playwright 独立执行、被 Baseline 比较、被失败恢复和被审计交付。

```text
V4 银行业务系统
  -> 提供稳定页面、正式业务 API、可重置 Fixture、业务终态和审计证据
v5.4 回归平台
  -> 读取案例与 RAG、生成/验证脚本、定时执行、比较 Baseline、解释失败并恢复
```

Fineract 仍是核心账务唯一事实源。v5.4 只能通过正式渠道和经过授权的测试支持边界操作 V4，不得绕过 Bank Channel Service 或直接写核心数据库。

## 2. V4 必须提供的业务目标系统

| 领域 | V4 落地要求 | v5.4 使用方式 |
|---|---|---|
| 客户渠道 | 登录、资产总览、账户、流水、收款人、转账、回单、通知 | 人工案例入口、页面复刻、Playwright 执行 |
| 运营渠道 | 客户审核、支付审核、风险处理、冲正、日终、对账、恢复 | 运营案例、人工确认、失败恢复和证据 |
| 核心账务 | 客户、储蓄、贷款、交易、总账、业务日期 | 账务终态和会计断言的唯一事实源 |
| 支付渠道 | 本行转账、模拟跨行、超时、重复、乱序、退回、冲正 | 状态机覆盖、异常案例和回归断言 |
| 安全 | Keycloak、MFA、角色、资源隔离、Maker-Checker | 权限案例、越权测试、风险动作门禁 |
| 可靠性 | Outbox/Inbox、幂等、对账、日终、备份恢复 | 失败事件、反向恢复和迁移验收 |

## 3. V4 与 v5.4 领域对象映射

| v5.4 对象 | V4 必须提供的事实 | 完成标准 |
|---|---|---|
| `RegressionCase` | 可人工执行的业务场景、角色、前置条件、步骤和预期终态 | 人工可重复，步骤可导出，失败原因可定位 |
| `Fixture` | 客户、账户、产品、余额、风险状态、业务日期和逻辑引用 | 可播种、可重置、namespace 隔离、禁止硬编码核心 ID |
| `BaselineDefinition` | 页面状态、业务状态、余额、流水、核心交易、审计和证据 | 页面与账务双重比较，字段来源明确 |
| `FullActionPlan` | 页面动作、业务动作、风险等级、确认点和回滚点 | AI 只生成计划，正式执行仍经过授权和门禁 |
| `AtomicAction` | 登录、导航、输入、提交、查询、确认、回退等原子动作 | 可被 Midscene 复刻，执行结果可观测 |
| `ActionEvent` | 动作开始、成功、失败、重试、阻断和人工确认 | 与 `caseId/runId/actionId/traceId` 关联 |
| `PlaywrightScriptPackage` | 稳定路由、语义化控件、可验证业务终态和测试数据 | 可独立验证，定时回归不依赖 LLM/Midscene |
| `FailureIncident` | 失败阶段、业务影响、证据、候选原因和当前状态 | 可解释、可通知、可选择恢复方案 |
| `RecoveryDecision` | 重试、恢复 Fixture、人工接管、回滚或阻断的决策结果 | 恢复前后均有审计，禁止伪造成功 |

## 4. V4 实施时必须新增的稳定性要求

### 4.1 页面稳定性

- 关键页面必须有稳定 URL、页面标题或语义区域标识。
- 关键控件必须使用稳定、语义化的 `data-testid` 或等价标识。
- 成功、失败、处理中、需人工审核等状态必须可见且可查询。
- 页面不得把随机 ID、当前时间或非业务噪声作为唯一成功判断依据。
- Customer Portal、Operations Console、Mifos X 的关键流程必须有页面目录和版本记录。

### 4.2 业务稳定性

- 每个资金流程必须有明确状态机、幂等键、订单 UUID、Fineract 交易引用和审计事件。
- 所有查询和写操作必须能关联到客户逻辑标识、账户逻辑标识和案例 namespace。
- 失败、超时、重复、乱序、退回和冲正必须是可构造、可观察、可恢复的正式场景。
- 业务状态必须可通过受控 API 或审计查询获得，不能只从数据库临时查询拼接。

### 4.3 测试数据稳定性

- Fixture 使用逻辑引用，例如 `customer.alice`、`account.alice.checking`，运行时再映射真实 Fineract ID。
- 每个案例拥有独立 namespace，重复执行不得污染其他案例。
- Fixture seed、reset、snapshot、restore 均必须记录操作者、案例、运行、时间和结果。
- 演示环境只使用虚构或脱敏数据；不得复制公司内网真实客户、账户或凭据。

### 4.4 证据稳定性

每个成功或失败运行至少应能关联：

```text
caseId -> runId -> actionId -> traceId
       -> 页面截图/录屏/网络摘要
       -> 业务状态/订单/核心交易
       -> 审计事件/通知/对账结果
```

## 5. V4 阶段与 v5.4 阶段映射

| V4 阶段 | V4 交付重点 | v5.4 对接门槛 |
|---|---|---|
| Phase 0 | 版本、Fineract、租户、端口、数据和风险冻结 | 能生成目标系统环境快照与可追溯版本 |
| Phase 1 | 契约、Gateway、Keycloak、渠道服务、可观测性 | 页面/API/事件/错误/Trace 契约可被回归平台消费 |
| Phase 2 | 客户、账户、流水、贷款查询 | 形成第一个可人工重复的 RegressionCase 和 Baseline |
| Phase 3 | 本行转账、幂等、状态机、对账 | 形成资金写操作的完整成功/失败/恢复案例 |
| Phase 4 | 跨行模拟、风险、MFA、运营审核 | 形成多角色、人工确认和异常恢复案例 |
| Phase 5 | 贷款、柜面、冻结、销户、通知、回单 | 扩展案例域、权限域和长期回归资产 |
| Phase 6 | 日终、恢复、全量回归、最终验收 | 通过独立 Playwright 验证、Baseline 比较和迁移演练 |

## 6. V4 进入 v5.4 的硬门槛

V4 不得仅以“页面能打开”或“接口返回 200”作为交付。至少满足以下条件，才允许登记为 v5.4 的有效测试目标：

1. Fineract 版本、租户、核心 API 和关键产品已冻结并可复现。
2. 客户登录、账户查询、本行转账、模拟跨行、运营审核、冲正、日终和恢复各有至少一个人工成功案例。
3. 每个成功案例都有可重置 Fixture、页面证据、业务终态、账务断言和审计链。
4. 关键写操作具备幂等、状态机、对账和重复执行保护。
5. 至少一组 Playwright 脚本可以脱离 LLM/Midscene 独立执行并完成 Baseline 比较。
6. 失败、超时、重复、乱序、退回和恢复路径均有可观察证据，不能只记录最终失败。
7. 外网演示使用隔离网络、TLS 边缘入口、最小权限和虚构/脱敏数据；内部核心端口不暴露。
8. 迁移到公司内网时只替换环境、模型、认证、通知和质量平台适配器，不改变业务与测试契约。

## 7. 状态口径

本文件是 V4 与 v5.4 的目标兼容基线，不代表当前仓库已经完成全部实现。当前银行核心状态继续以实际审计、测试和运行证据为准；v5.4 AI 编排、企业平台适配和内网联调继续单独标记为规划中、PoC 或 `PENDING_ENTERPRISE_VALIDATION`。

## 8. 关联文档

- [V4 上层实施规范（历史）](../archive/implementation-plans/Apache_Fineract_Mifos_Agent_Implementation_Plan.md)
- [V5.4 外网演示系统与内网迁移基线](v5.4-external-demo-baseline.md)
- [V5.4 平台文档规划](../../agent/plans/active/v54-platform-documentation-plan.md)
- [Docs 与 RAG 协作规范](../workflows/rag-governance.md)
