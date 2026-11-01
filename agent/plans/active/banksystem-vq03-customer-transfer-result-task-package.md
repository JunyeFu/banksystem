---
id: BANKSYSTEM-OSS-VQ03-CUSTOMER-TRANSFER-RESULT-001
title: Customer transfer and authoritative result visual confirmation
document_type: task
domain: frontend
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-03：客户转账与结果回读

## 业务目标

让纯合成演示客户选择转出账户和目标账户，输入精确的 CNY 金额，核对摘要后提交一次带幂等键的转账，并从正式银行链路回读最终已结算结果、业务关联号和 Fineract 交易号。

## 输入与输出

- 用户角色：已登录的纯合成演示客户。
- 输入：转出账户、目标账户/收款人、十进制金额、CNY 和可选备注。
- 提交元数据：`Idempotency-Key` 和 `correlationId`，均由受控链路生成并连续传递。
- 输出：转账参考号、业务关联号、Fineract 交易号、转出/目标账户、金额、币种、最终状态和电子回单入口。
- 可观察结果：界面不以“已提交”代替“已结算”；只在回读 Fineract 结果后展示“转账已成功”。

## 业务常识

- Fineract 是余额、交易和最终记账状态的唯一银行真相源。
- 正式写链路是 `Customer Portal -> Gateway -> Bank Channel -> Fineract API`；前端不直连 Fineract 或数据库。
- 金额使用十进制两位小数，不得使用浮点近似值。
- 重复提交同一幂等键只能产生一次记账；前后余额必须满足守恒关系。
- 本轮客户结果中的业务关联号将在 `VQ-04` 运营端回读同一笔交易。

## 实现模板

```text
validated transfer form
  -> explicit customer review
  -> POST Gateway transfer with Idempotency-Key
  -> Bank Channel state machine and outbox
  -> Fineract posting
  -> GET authoritative transfer result
  -> SETTLED | FAILED | TIMED_OUT | RETURNED
  -> receipt and correlation readback
```

最小成功结果合同：

```json
{
  "journeyId": "bank-transfer-golden",
  "correlationId": "CORR-DEMO-000042",
  "sourceAccountId": "synthetic-source",
  "targetAccountId": "synthetic-target",
  "amount": "100.00",
  "currency": "CNY",
  "fineractTransactionId": "FINERACT-TXN-000042",
  "status": "COMPLETED"
}
```

## 项目易错点

- 不得在 POST 返回 `CREATED` 或 `202 Accepted` 时立即展示转账成功。
- 禁止用前端 Mock、直接数据库写入或手工修改结果 JSON 伪造入账。
- 转出金额、手续费、总额和账户余额不得混用文本或浮点计算。
- 幂等键、业务关联号和 Fineract 交易号不得在页面切换或轮询中丢失。
- 候选图只展示成功黄金路径；实现仍必须具有校验、提交中、处理中、失败和超时状态。
- AI 图中字形和合成数值不是可执行合同；以本文、OpenAPI 和浏览器断言为准。

## 已实现视觉蓝图

- `PV-0028.png`：默认转账表单与右侧摘要，SHA-256 `a5fd8801e1e95ccc42dbf4c9b8d553f4de7a3cde5c99ed6ca8ec3842af232f79`。
- `PV-0034.png`：已选账户和收款人的表单密度，SHA-256 `a89ca7e9c09c6917bb0aea753892aac909b52554a41bc4b6dc7444ebf100b6d3`。
- `PV-0035.png`：已结算结果、绿色成功标识和回单动作，SHA-256 `27fcfa944f7d60674f9ac25054c37501bb7602ce41382b68e63abe8c5bc59b20`。
- 必须继承 VQ-02 已确认的红白品牌、水平导航、浅灰细边框卡片、黑色标题和绿色成功状态。

## 预览功能与明确非功能

预览必须同时表达：

- 左侧转账态：转出账户、合成目标账户、`100.00 CNY`、备注、手续费和合计摘要。
- 右侧结果态：“转账已成功”、已结算状态、脱敏账户、金额、转账参考号、业务关联号、Fineract 交易号和回单入口。
- 两个状态属于同一客户门户，只使用纯合成账号和中性演示摘要。

本轮不展示运营查询、CLI、Quality Portal、原生 U 盾窗口、PIN/OTP/验证码、贷款、理财或其他产品。

## 生图提示词

```text
Use case: ui-mockup
Asset type: VQ-03 high-fidelity 16:9 customer transfer and authoritative result preview
Primary request: Generate a new two-state transfer preview for the open-source demo bank 复兴银行, faithfully using the three implemented Customer Portal screenshots as the visual blueprint. Show a completed transfer form on the left and its authoritative settled result on the right.
Input images: Image 1 is the authoritative implemented default transfer-form layout and summary-card reference; Image 2 is the authoritative populated-account and beneficiary form-density reference; Image 3 is the authoritative settled-result layout, success icon, field grid and action reference.
Scene/backdrop: one clean desktop presentation with two clearly separated browser-page states from the same Customer Portal, no device frames.
Subject: left state contains a horizontal header with only 账户概览, 账户 and 转账, a populated transfer form, a right-side transfer summary, source account **** 8888, synthetic target account **** 6688, amount 100.00 CNY, note 黄金链路演示, fee 0.00 CNY and red 确认转账 action. Right state contains the same header, a green success check, 转账已成功, settled status, masked source and target accounts, 100.00 CNY, transfer reference, business correlation ID, Fineract transaction ID, receipt download and return-to-list actions.
Style/medium: faithful high-fidelity React Ant Design enterprise banking UI derived from the references, not a redesigned theme.
Composition/framing: wide landscape, transfer form approximately 56 percent and successful result approximately 44 percent, clear left-to-right business progression, readable cards and fields.
Color palette: established 复兴银行 white and very light cool gray surfaces, near-black headings, project red around #d9161c for brand/navigation/actions, green only for settled success.
Text (verbatim): "复兴银行", "新建转账", "转出账户", "目标账户", "转账金额", "备注", "转账摘要", "100.00 CNY", "确认转账", "转账已成功", "已结算", "转账参考号", "业务关联号", "Fineract 交易号", "下载电子回单", "返回转账列表".
Constraints: preserve the reference red diamond mark, horizontal header, active red underline, form proportions, summary card, result field grid, card borders and spacing; use only masked synthetic account identifiers and neutral synthetic names; exact decimal CNY amount; no real PII; no watermark.
Avoid: navy or teal theme, sidebar, loans, beneficiaries management, documents center, messages, profile, security settings, enterprise names from the reference fixtures, operations console, CLI, Quality Portal, Flowise, Coze, HiAgent, database imagery, native U-key window, PIN, OTP, QR code, mobile screens, glassmorphism, gradients, neon or 3D decoration.
```

## 验证

- STATIC：用户角色、业务字段、功能/非功能、蓝图摘要和受影响小包完整。
- DESIGN_PREVIEW：仅一张当前候选图，路径和 SHA-256 与控制树一致。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行，不因生图而视为通过。

## 完成门

- 项目负责人文本确认当前候选和上述转账结果边界。
- 决定、候选路径和 SHA-256 回灌控制树与 RF-028 证据。
- 确认只解锁 `A03-M03-S02` 的视觉门；不授权转账执行，不改变 A02 阻塞，不冻结 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-03`，或在 `VQ-03` 是当前唯一问题时明确回复 `继续`。
- 修改：`修改 VQ-03：<需要调整的视觉、字段或功能>`。

确认后才生成 `VQ-04`。

## 候选记录

- 生成方式：内置 ImageGen；以三张已实现页面为参考生成一张候选，并对结果卡三个标识符前缀执行一次定向修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-03-customer-transfer-result-v1.png`。
- SHA-256：`4e866daf2006ed6692c073f46460c53ce57e7fef809cdd0946b6b1c153edb4a0`。
- 当前状态：`AWAITING_USER`。

定向修订提示词：

```text
Edit only three identifier values in the right-side settled-result card of the most recent VQ-03 image. Replace the value under "转账参考号" with exactly "TRF-DEMO-000042". Replace the value under "业务关联号" with exactly "CORR-DEMO-000042". Replace the value under "Fineract 交易号" with exactly "FINERACT-TXN-000042". Preserve every other pixel, label, amount, account mask, status, layout, header, bank mark, color, border, spacing and action exactly as-is. Do not add, remove or move anything.
```

## 项目负责人决定

- 原文：`继续`。
- 解释：`CONFIRMED_AND_ADVANCE`。
- 确认时间：`2026-08-30T22:23:58+08:00`。
- 结果：`VQ-03` 视觉门已确认，当前问题前进到 `VQ-04`；未产生实现、LIVE_E2E 或发布证据。
