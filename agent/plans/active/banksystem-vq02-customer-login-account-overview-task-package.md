---
id: BANKSYSTEM-OSS-VQ02-CUSTOMER-LOGIN-ACCOUNT-OVERVIEW-001
title: Customer login and account overview visual confirmation
document_type: task
domain: frontend
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-02：客户登录与账户总览

## 业务目标

让纯合成演示客户从统一身份登录进入银行首页，立即看到与其 Fineract 客户身份唯一映射的账户、可用余额和近期交易，并能从明确入口进入下一轮确认的转账流程。

## 输入与输出

- 用户角色：仅限纯合成演示客户，不包含运营或质量平台权限。
- 输入：图形界面中用户主动输入的用户名和密码；登录成功后的受保护会话。
- 输出：登录成功的身份状态、已脱敏客户名、CNY 账户号后四位、账户状态、账面余额、可用余额与近期交易。
- 可观察结果：登录前后是同一产品视觉体系；账户数据来自正式银行链路，加载、错误、空数据和就绪态明确区分。

## 业务常识

- Fineract 是客户、账户、余额和交易的唯一银行真相源。
- 门户只调用 Gateway，正式读链路是 `Customer Portal -> Gateway -> Bank Channel -> Fineract`。
- Keycloak 登录身份必须与 Fineract 客户持久、唯一映射；服务重启不得改变关系。
- 可用余额与账面余额是不同业务字段，不得在界面上混用。

## 实现模板

```text
/portal/login
  -> Keycloak authentication
  -> protected customer session
  -> GET Gateway customer profile/accounts/transactions
  -> generated typed client
  -> loading | error | empty | ready
  -> accessible Ant Design account overview
```

账户列表的最小展示合同：

```json
{
  "accountId": "synthetic-id",
  "maskedAccountNumber": "**** 4821",
  "currency": "CNY",
  "status": "ACTIVE",
  "ledgerBalance": "128600.00",
  "availableBalance": "128600.00"
}
```

## 项目易错点

- 不得以前端 Mock、硬编码账户卡片或直接数据库查询伪装已完成账户查询。
- 容器健康不证明图形登录、客户映射或账户读取成功。
- 页面不得直连 Fineract，也不得在浏览器保存服务凭据。
- 本轮不引入未在黄金链路内的信用卡、贷款、理财、虚拟货币或生物识别。
- AI 生图文字只是布局预览；精确字段、数值和页面状态以本文本合同和后续浏览器验收为准。

## 预览功能与明确非功能

预览必须同时表达：

- 登录页：用户名、密码、登录按钮与演示身份提示。
- 账户总览：客户会话、总资产、可用余额、账户卡片、近期交易和转账入口。
- 只展示纯合成账号和 CNY，突出有限但可验证的黄金业务，不制造“全功能数字银行”假象。

本轮不展示转账表单、转账执行结果、运营查询、CLI 或 Quality Portal；它们分别属于后续 `VQ-03` 至 `VQ-07`。

## 当前修订请求

- 项目负责人原文：`按已实现页面的风格为蓝图生成预览图`。
- 规范化决定：`REVISION_REQUESTED`，记录时间 `2026-08-30T21:51:27+08:00`。
- 风格蓝图：`tests/e2e/frontend-customer-core/snapshots/PV-0006.png` 登录页、`PV-0010.png` 账户概览、`PV-0018.png` 账户详情/交易记录，并以 `apps/customer-portal/src/styles.css` 和当前 React 页面为校验源。
- 蓝图摘要：`PV-0006=0305c11408c70e9c319112953667da962d190f7382da82017cd7cf3416a56e06`，`PV-0010=d6cd04354c003dbe3c83283b252fdaf17d07c1cabfb0eefa1263fd9f5c6da630`，`PV-0018=51961de2727b9e93f3e3fa75797a88ef6a031715e574bcd21babfdaec8e9da47`。
- 必须继承：红色银行品牌标记、白色桌面、水平导航、红色活动态/主动作、浅灰边框卡片、黑色高对比标题、绿色成功状态和宽松的银行业务布局。
- 不继承初版候选的深蓝侧栏、青绿主按钮或第二套品牌标记。

## 初版生图提示词

```text
Use case: ui-mockup
Asset type: high-fidelity 16:9 two-state desktop banking product storyboard
Primary request: Show the final customer experience for the open-source demo bank 复兴银行, with secure login on the left and the authenticated account overview on the right, as two clearly connected states of one coherent desktop web product.
Scene/backdrop: clean Windows 11 desktop presentation without device frames, realistic enterprise software, bright neutral workspace.
Subject: left 32 percent is a focused login page with username field, password field, one primary login button and a small synthetic-demo identity note; right 68 percent is the customer account overview after login with a restrained side navigation, authenticated customer header, total assets, available balance, one or two CNY account cards with masked identifiers, recent transactions and one clear entry labelled 发起转账.
Style/medium: high-fidelity enterprise fintech UI mockup, trustworthy, restrained, accessible and interview-portfolio quality.
Composition/framing: wide landscape, obvious left-to-right login-to-overview flow, account overview is dominant, generous spacing and readable hierarchy.
Lighting/mood: bright, calm and credible.
Color palette: dark navy, white, cool gray, restrained teal and success green, matching the confirmed VQ-01 product family.
Text (verbatim): "复兴银行", "客户登录", "用户名", "密码", "登录", "账户总览", "总资产", "可用余额", "近期交易", "发起转账", "CNY".
Constraints: desktop web only; synthetic masked account numbers; no real PII; one clear customer role; login and overview share the same visual language; use realistic Chinese typography; no watermark.
Avoid: transfer form or completed-transfer result, operations console, Quality Portal, CLI, Flowise, Coze, HiAgent, direct database imagery, loans, credit cards, wealth management, crypto, social login, biometrics, mobile screens, neon cyberpunk, glassmorphism, excessive gradients, clutter or tiny unreadable text.
```

## 验证

- STATIC：提示词、用户角色、功能/非功能和受影响小包完整。
- DESIGN_PREVIEW：仅一张当前候选图，路径和 SHA-256 与记录一致。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行，也不因生图而视为通过。

## 完成门

- 项目负责人文本确认候选图及上述功能边界。
- 决定、候选路径和 SHA-256 回灌控制树与 RF-028 证据。
- 确认只解锁 `A03-M03-S01` 的视觉门，不改变 A02 阻塞，不冻结 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-02`，或在 `VQ-02` 是当前唯一问题时明确回复 `继续`。
- 修改：`修改 VQ-02：<需要调整的视觉、信息或功能>`。

确认后才生成 `VQ-03`。

## 候选记录

- 生成方式：内置 `imagegen`；一次未返回可落盘对象的空结果已丢弃，随后执行一次基础生成和一次业务范围定向修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-02-customer-login-account-overview-v1.png`。
- SHA-256：`d46b35460b99648ce0cfe24044b5e567bd67db40bf1d650b2680295e000319c4`。
- 候选状态：`SUPERSEDED_BY_REVISION`。
- 替代原因：未沿用已实现 Customer Portal 的红白品牌、水平导航和卡片语言。

最终提示词集合由上方基础提示词和以下定向修订组成：

```text
Edit the most recent VQ-02 banking UI image while preserving its overall two-state composition, navy-white-teal visual language, spacing, and high-fidelity desktop style. Make only these scope corrections: 1) replace the top-right enterprise role with the exact synthetic personal role label "演示客户" and remove the customer number; 2) replace corporate account names with "活期储蓄账户" and "备用储蓄账户"; 3) simplify the dark side navigation to only "账户总览", "交易明细", "转账汇款", and "退出登录"; remove 账户管理, 收款人管理, 消息中心, 安全设置, and 帮助中心; 4) remove every loan, credit, corporate, wealth, or other product reference from the recent transaction list, using only neutral synthetic transfer entries such as "演示转入", "演示转出", and "服务费"; 5) keep exactly one primary button labelled "发起转账" but do not show a transfer form or result; 6) ensure the visible currency label is exactly "CNY" everywhere; 7) preserve the left login page with exact labels "复兴银行", "客户登录", "用户名", "密码", and "登录". Use only masked synthetic account identifiers and no real PII. Do not add any new feature or panel.
```

## 修订版当前候选

- 生成方式：内置 `imagegen`；以 `PV-0006`、`PV-0010`、`PV-0018` 三张已实现页面为参考生成，再执行一次功能范围裁剪和一次交易摘要脱敏修订。
- 当前候选：`docs/design/visual-acceptance/banksystem-v1/vq-02-customer-login-account-overview-v2.png`。
- SHA-256：`ce153c4cb3ca33bdff4fe1edd9648af883d37204e5a1df0c6c73599cabf77974`。
- 候选状态：`CONFIRMED`。
- 实现影响：只替换 VQ-02 的视觉蓝图，不改变页面数据合同、A02 阻塞、运行态或 ReleaseIdentity。
- 项目负责人原文决定：`确认1VQ-02`。
- 规范化决定：`CONFIRMED`；在当前唯一问题中将确认动词与问题编号之间的单个多余数字视为输入噪声，记录时间 `2026-08-30T22:04:48+08:00`。

修订版最终提示词集合：

```text
Use case: ui-mockup
Asset type: VQ-02 high-fidelity 16:9 visual confirmation preview for the open-source demo bank
Primary request: Generate a new two-state customer login and account overview preview whose visual blueprint is the already implemented 复兴银行 Customer Portal shown in the three reference screenshots. Preserve the product's established visual identity instead of inventing a new bank theme.
Input images: Image 1 is the authoritative implemented login-page style and layout reference; Image 2 is the authoritative implemented account-overview style, header, navigation, card and spacing reference; Image 3 is the authoritative implemented account-detail and transaction-table typography reference.
Scene/backdrop: one clean desktop presentation containing two clearly separated browser-page states, login on the left and authenticated account overview on the right, without device frames.
Subject: the left state shows the real implemented-style customer login card with the red diamond bank mark, white surface, account/password fields and security assurance; the right state shows the real implemented-style horizontal customer header, greeting for a synthetic demo customer, asset and available-balance cards, masked CNY account rows, a compact recent-transactions table, and one red-outline or red-primary entry for creating a transfer.
Style/medium: faithful high-fidelity enterprise banking UI mockup derived from the reference screenshots; React Ant Design visual language; crisp Chinese desktop web typography.
Composition/framing: wide landscape; login state about 38 percent, account overview about 62 percent; generous white space; thin cool-gray borders; subtle card shadows; no sidebar.
Color palette: exact established family from the references: white and very light cool gray surfaces, near-black headings, muted gray secondary text, project red around #d9161c for brand, active navigation and primary actions, green only for normal/success account state.
Text (verbatim): "复兴银行客户门户", "客户登录", "账号密码登录", "用户名 / 手机号", "密码", "通过统一身份认证登录", "安全 · 稳定 · 可审计", "账户概览", "您好，演示客户", "我的资产", "可用余额", "我的账户", "近期交易", "新建转账", "CNY", "正常".
Constraints: faithfully match the reference bank mark proportions, horizontal header, red active underline, card radius, borders, spacing and information density; use only synthetic masked account identifiers and CNY; keep login and overview as the same implemented product family; desktop web only; no real PII; no watermark.
Avoid: navy or teal theme, dark sidebar, a second logo system, enterprise customer role, loans, credit cards, wealth management, beneficiaries, documents, messages, security settings, operations console, Quality Portal, CLI, Flowise, Coze, HiAgent, transfer form, completed-transfer result, mobile screens, glassmorphism, gradients, neon, 3D decoration or marketing illustration.
```

```text
Edit only the most recent generated VQ-02 preview. Preserve exactly its implemented 复兴银行 red-and-white visual identity, red diamond bank marks, split login/overview composition, typography, thin gray card borders, spacing, header height, footer, login card, security-login methods, greeting, synthetic customer, and Ant Design appearance. Make these content-scope corrections on the right account-overview state only: 1) the horizontal navigation must contain only "账户概览", "账户", and "转账"; remove 收款人, 贷款, 文档, 消息, 个人资料, and 安全设置; 2) keep exactly three top statistic cards: "我的资产（等值 CNY）", "账户数量", and "可用余额（CNY）"; remove the 银行文件 card; 3) remove the four-item quick-action strip containing 管理收款人, 申请贷款 and 下载文档; 4) keep a compact "我的账户" section with two masked CNY account rows and green "正常" tags; 5) add a compact "近期交易" table below the account rows using the same typography and row style as the implemented account-detail reference, with three synthetic rows and columns "日期", "摘要", "金额", "状态"; 6) include exactly one red outline action labelled "新建转账", but do not show a transfer form or result. Do not alter the left login state. Do not add any new product, illustration, sidebar, color theme, or decoration.
```

```text
Edit only the three transaction-summary text cells in the most recent VQ-02 image. Replace the first row summary "转账至 张三" with "演示转出"; replace the second row summary "工资入账" with "演示转入"; replace the third row summary "支付宝（上海）有限公司" with "服务费". Preserve every other pixel, text label, number, date, layout, bank mark, color, border, spacing and component exactly as-is. Do not add or remove anything.
```
