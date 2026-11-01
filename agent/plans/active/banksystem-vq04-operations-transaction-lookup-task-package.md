---
id: BANKSYSTEM-OSS-VQ04-OPERATIONS-TRANSACTION-LOOKUP-001
title: Operations correlation lookup and transaction detail visual confirmation
document_type: task
domain: frontend
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-04：运营端关联查询与交易详情

## 业务目标

让已登录的纯合成演示运营人员使用 `VQ-03` 产生的业务关联号查询同一笔转账，并在运营控制台回读与客户页面一致的转账编号、金额、币种、状态、脱敏账户和核心参考号，以及只读状态历史和安全审计元数据。

## 输入与输出

- 用户角色：具有支付监控只读权限的合成运营人员。
- 输入：业务关联号 `CORR-DEMO-000042`；可选状态、币种和日期筛选。
- 查询入口：`GET /api/operations/v1/transfers?query=CORR-DEMO-000042`。
- 详情入口：`GET /api/operations/v1/transfers/{transferId}`。
- 输出：`TRF-DEMO-000042`、`100.00 CNY`、`SETTLED`、脱敏账户、`FINERACT-TXN-000042` 对应的 `coreReference`、状态历史、审计计数和 Outbox 安全元数据。
- 可观察结果：客户结果与运营结果在关联号、转账编号、金额、币种、状态和核心参考号上完全一致。

## 业务常识

- Fineract 仍是账务真相源；运营控制台只读取 Gateway 提供的运营 API，不直连 Fineract 或数据库。
- `correlationId` 用于串联客户请求、Gateway、Bank Channel、Fineract 回读与证据，不得被转账 ID 或幂等键替代。
- `coreReference` 是当前运营合同暴露的核心记账参考字段；本演示用合成值 `FINERACT-TXN-000042` 表达它与 VQ-03 Fineract 交易号的同一性。
- 列表状态和详情状态必须来自同一权威记录，不能由前端分别拼接。
- 运营查询是只读观察，不得顺带改变转账、风险、审批、清算或对账状态。

## 实现模板

```text
authenticated operations user
  -> enter exact correlationId
  -> GET Gateway operations transfer list
  -> select the unique matching transferId
  -> GET authoritative transfer detail
  -> compare amount/currency/status/coreReference/correlationId
  -> display state history and redacted evidence metadata
```

最小一致性断言：

```json
{
  "transferId": "TRF-DEMO-000042",
  "correlationId": "CORR-DEMO-000042",
  "amount": "100.00",
  "currency": "CNY",
  "status": "SETTLED",
  "coreReference": "FINERACT-TXN-000042",
  "sourceAccount": "**** 8888",
  "targetAccount": "**** 6688"
}
```

## 项目易错点

- 不得只按模糊关键词命中多笔后选择第一笔；黄金链路必须精确匹配业务关联号并得到唯一结果。
- 不得把列表中的缓存状态与另一个详情响应拼成同一笔交易。
- 不得在页面或证据中暴露完整账户号、事件载荷、凭据、Token 或真实客户信息。
- 不得把“查询成功”解释为转账执行成功；转账结果仍由权威状态字段决定。
- 不得在本屏加入审批、冲正、风险处置或清算执行按钮。
- AI 图中字形和合成数值只是设计沟通材料；实现以 OpenAPI、类型客户端和浏览器断言为准。

## 已实现视觉蓝图

- `PV-0073.png`：支付监控正常列表、筛选区、指标卡和深色运营侧栏，SHA-256 `bac1deaa42a2a33f6aa78222902f0f70c1bccb5adac882dbca4b830d4e2c1851`。
- `PV-0077.png`：支付状态筛选密度与交互层级，SHA-256 `046fad0948e785fb9b349ec5421f8ebf4159e1ab14d5ed5fddfa6da8d52e00da`。
- `PV-0084.png`：支付详情、交易摘要、审计证据和状态历史时间线，SHA-256 `4727919d9084b41b463fd5d8d46ee39d0cfd6508ec511b4b77d831c55c2be469`。
- 必须继承实际运营控制台的深色侧栏、红色激活项、白色内容区、浅灰卡片和 Ant Design 表格/标签体系，不使用客户门户水平导航。

## 预览功能与明确非功能

预览必须同时表达：

- 左侧查询态：输入 `CORR-DEMO-000042`，状态为已结算、币种为 CNY，唯一结果显示 `TRF-DEMO-000042`、`100.00 CNY`、已结算和 `FINERACT-TXN-000042`。
- 右侧详情态：同一转账的交易摘要、脱敏账户、关联 ID、核心参考号、状态历史和只读审计证据。
- 两个状态属于同一运营控制台，并明确形成“按关联号查询 -> 打开详情 -> 核对同一笔交易”的阅读路径。

本轮不展示客户转账表单、审批、冲正、风险处置、清算/对账执行、CLI、Quality Portal、Flowise、数据库查询、完整账户号或敏感事件载荷。

## 生图提示词

```text
Use case: ui-mockup
Asset type: VQ-04 high-fidelity 16:9 operations correlation lookup and authoritative transaction detail preview
Primary request: Generate a new two-state operations-console preview for the open-source demo bank 复兴银行, faithfully using the three implemented Operations Console screenshots as the visual blueprint. Show an exact correlation-ID lookup on the left and the selected authoritative transaction detail on the right.
Input images: Image 1 is the authoritative implemented payment-monitoring list, filters, metrics and expanded dark-sidebar reference; Image 2 is the authoritative implemented filter density and status-control reference; Image 3 is the authoritative implemented payment-detail, transaction-summary, audit-evidence and timeline reference.
Scene/backdrop: one clean desktop presentation with two clearly separated route states from the same Operations Console, no browser chrome and no device frames.
Subject: left state contains the implemented dark operations sidebar with 支付监控 active in red, filters for 已结算 and CNY, a search field containing CORR-DEMO-000042, a red 查询 button, metrics and exactly one matching row with TRF-DEMO-000042, 100.00 CNY, 已结算, FINERACT-TXN-000042, CORR-DEMO-000042 and 详情. Right state contains the same operations identity and a 支付详情 page with 交易摘要, masked source account **** 8888, masked target account **** 6688, 100.00 CNY, 已结算, 核心参考号 FINERACT-TXN-000042, 关联 ID CORR-DEMO-000042, a compact 状态历史时间线 and a small read-only 审计证据 card.
Style/medium: faithful high-fidelity React Ant Design enterprise operations UI derived from the references, not a redesigned theme.
Composition/framing: wide landscape, lookup state approximately 48 percent and detail state approximately 52 percent, clear left-to-right query-to-detail progression, readable table row and summary fields.
Color palette: established near-black operations sidebar, white and very light cool-gray content, project red around #d71920 for active navigation and query action, green only for settled status, muted gray borders and metadata.
Text (verbatim): "复兴银行", "运营控制台", "支付监控", "已结算", "CNY", "CORR-DEMO-000042", "查询", "TRF-DEMO-000042", "100.00 CNY", "FINERACT-TXN-000042", "详情", "支付详情", "交易摘要", "核心参考号", "关联 ID", "状态历史时间线", "审计证据".
Constraints: preserve the implemented dark sidebar proportions, red active navigation block, white header, filter-card density, metric tiles, table styling, detail cards and timeline; use only masked synthetic account identifiers; show one exact match; keep all identifiers and decimal amount internally consistent; no real PII; no watermark.
Avoid: customer-portal horizontal navigation, multiple matching rows, approval or reversal controls, risk disposition, clearing or reconciliation execution, loan or wealth products, CLI, Quality Portal, Flowise, Coze, HiAgent, database imagery, raw event payloads, credentials, full account numbers, QR code, mobile screens, glassmorphism, gradients, neon or 3D decoration.
```

## 验证

- STATIC：用户角色、查询键、同笔一致性字段、功能/非功能、蓝图摘要和受影响小包完整。
- DESIGN_PREVIEW：仅一张当前候选图，路径和 SHA-256 与控制树一致。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行，不因生图而视为通过。

## 完成门

- 项目负责人文本确认当前候选和上述只读运营回查边界。
- 决定、候选路径和 SHA-256 回灌控制树与 RF-028 证据。
- 确认只解锁 `A03-M03-S03` 的视觉门；不授权运营写操作，不改变 A02 阻塞，不冻结 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-04`，或在 `VQ-04` 是当前唯一问题时明确回复 `继续`。
- 修改：`修改 VQ-04：<需要调整的视觉、字段或功能>`。

确认后才生成 `VQ-05`。

## 候选记录

- 生成方式：内置 ImageGen；以三张已实现运营页面为参考生成一张候选，并对详情账户和备注执行一次定向脱敏修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-04-operations-transaction-lookup-v1.png`。
- SHA-256：`a0adf259715398a8b1f993b5ebfe88f6801a0e321a9d0e42d990df40d5d2ffda`。
- 当前状态：`AWAITING_USER`。

定向修订提示词：

```text
Edit only three text values in the right-side 支付详情 transaction-summary card of the provided VQ-04 image. Under "转出账户", replace the entire value with exactly "**** 8888". Under "目标账户", replace the entire value with exactly "**** 6688". Under "备注", replace the entire value with exactly "黄金链路演示". Preserve every other pixel, label, identifier, amount, status, timestamp, audit count, timeline, layout, sidebar, header, color, border, spacing and action exactly as-is. Do not add, remove, resize or move anything.
```

## 项目负责人决定

- 原文：`确认`。
- 解释：`CONFIRMED_AND_ADVANCE`；`VQ-04` 是当时唯一待确认问题。
- 确认时间：`2026-08-30T22:43:39+08:00`。
- 结果：`VQ-04` 视觉门已确认，当前问题前进到 `VQ-05`；未产生实现、LIVE_E2E 或发布证据。
