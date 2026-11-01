---
id: BANKSYSTEM-OSS-VQ05-CLI-AUTHOR-APPROVE-001
title: CLI Journey authoring validation and exact approval visual confirmation
document_type: task
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-05：CLI Journey 设计、校验与精确批准

## 业务目标

让测试工程师在 `hz-agent` 终端中用自然语言描述复兴银行黄金转账目标，由唯一配置的 BYOK 模型生成候选 Journey；CLI 显示合同校验结果、冻结版本和内容摘要，只有项目负责人对精确 proposal 做出明确批准后，该不可变 Journey 修订才具备进入执行阶段的资格。

## 输入与输出

- 用户角色：本机测试工程师或演示操作者。
- 自然语言输入：`验证复兴银行黄金转账：客户登录，转账 100.00 CNY，运营端按关联号回查。`
- 前置条件：唯一模型绑定、Harness、MCP 与本机会话已就绪；模型密钥不进入终端记录。
- 候选输出：`journeyId=bank-transfer-golden`、`revision=v1`、4 个步骤、8 个断言、合同校验状态和 `contentHash`。
- 批准输入：当前 `proposalId` 或其风险策略要求的精确后缀；拒绝输入只作用于同一待决 proposal。
- 批准输出：Journey 修订状态 `APPROVED`；执行能力仍由后续 `VQ-06` 调用，不在本轮自动发生。

## 业务常识

- 模型生成的候选 Journey 不是可执行测试；必须先通过确定性 schema 和业务合同校验。
- 批准对象是冻结的 Journey 修订、`proposalId`、`contentHash`、版本和过期时间的精确组合，不是自然语言摘要。
- `journey_decision_submit` 在当前风险策略中是 `HIGH`，因此交互式 TUI 必须要求精确 proposal 后缀。
- Journey、修订和批准状态由 Harness SQLite 持久化；TUI 只是同一 CLI 事件流的投影，不拥有第二份业务状态。
- 批准后禁止模型重新生成步骤或参数；任何修订都形成新版本并重新校验、重新批准。

## 实现模板

```text
natural-language goal
  -> configured model authors candidate JSON
  -> deterministic Journey schema validation
  -> business invariant validation
  -> freeze revision + contentHash
  -> APPROVAL_REQUIRED with exact proposal tuple
  -> explicit approve or reject
  -> Harness authoritative readback
  -> APPROVED | REJECTED | EXPIRED | FAILED_CLOSED
```

最小冻结摘要：

```json
{
  "journeyId": "bank-transfer-golden",
  "revision": "v1",
  "steps": 4,
  "assertions": 8,
  "status": "VALIDATED",
  "proposalId": "proposal-demo-0000a501",
  "contentHash": "7c4e...a501",
  "risk": "HIGH"
}
```

## 项目易错点

- 禁止生成后自动批准、使用 `--yes`、隐藏批准或把模型自评当合同校验。
- 禁止批准摘要后在执行前重新生成步骤、选择器、目标或断言。
- 禁止宽泛重试模型请求、切换备用模型或在模型失败时落入确定性 Mock。
- 禁止把 API key、完整凭据、本机附件路径或银行登录秘密写入 transcript、proposal 或证据。
- 拒绝、过期、哈希漂移、版本漂移或 proposal 不匹配必须失败关闭且执行仍锁定。
- AI 图中文字只是交互预览；正式命令、事件字段和退出码以 CLI 合同为准。

## 已实现交互蓝图

- `agent-cli/tui/view.mjs`：实际 header、transcript、stage、footer 和 approval overlay 布局，SHA-256 `a414e2da10e66e9e00f981e2a336c3cf798441ba2ec6d05ded78cd091cbd3b07`。
- `agent-cli/tui/model.mjs`：实际事件 reducer、slash command 和 HIGH 风险精确后缀逻辑，SHA-256 `22ebc4a0881b334aad417eaddca185338b065f2b4cf8654e9177a9d38191b4d5`。
- `agent-cli/test/tui.test.mjs`：40/80/120 列、多语言、resize 与精确批准测试，SHA-256 `ad586e8bb09f9a85437489cf19ad0b957440cda912928413a325a1175587021c`。
- `controller/risk-policy-v2.json`：`journey_decision_submit=HIGH` 的当前风险绑定，SHA-256 `99c93d990a338a2b55e4b5e728e788802fe6d6ec8805dff6c9e61c59aea0b65f`。
- VQ-01 已确认组合图仅作为 Windows Terminal 黑底等宽视觉参考，SHA-256 `b4055244a2febe7dcad91f3d56c7407036595d8a818df4c3d85dd085adedc6cb`；不得复制其中银行或运营页面。

## 预览功能与明确非功能

预览必须同时表达：

- 作者化与校验态：自然语言目标、候选 Journey v1、4 steps、8 assertions、`CONTRACT VALID`、冻结内容哈希和 `STAGE VALIDATED`。
- 精确批准态：`APPROVAL HIGH`、冻结摘要、proposal 后缀 `0000a501`、`/approve 0000a501`、`/reject` 和 `STAGE AWAITING_APPROVAL`。
- 同一 `session-demo-0042` 和 `bank-transfer-golden` 在两个状态连续可追踪。

本轮不展示浏览器执行、截图/trace、PASS/FAIL、ReleaseIdentity、Full18、Quality Portal、Flowise、模型密钥、银行登录凭据、自动批准或 Web Agent 控制台。

## 生图提示词

```text
Use case: ui-mockup
Asset type: VQ-05 high-fidelity 16:9 hz-agent CLI Journey authoring, validation and exact approval preview
Primary request: Generate one focused Windows Terminal product preview for the open-source CLI testing Agent hz-agent. Use the confirmed product-combination image only for its dark Windows Terminal and monospaced CLI visual language, while following the actual implemented HENGZHUN AGENT TUI structure from the supplied source description: header, transcript, stage, footer and approval overlay. Show two adjacent time states of the same terminal session: author-and-validate on the left, exact approval required on the right.
Input image: Image 1 is a supporting visual reference; use only its lower dark hz-agent terminal styling. Do not copy any bank portal, operations console or quality portal from it.
Scene/backdrop: one large, clean Windows Terminal window on a restrained dark desktop backdrop; two equal terminal panes separated by a thin divider; no browser UI.
Subject: both panes use a near-black terminal canvas, crisp monospaced typography and a top line reading HENGZHUN AGENT with session:session-demo-0042 and journey:bank-transfer-golden. The left pane shows the user goal in Chinese, then a candidate Journey v1 summary with 4 steps, 8 assertions, CONTRACT VALID, content hash 7c4e...a501 and STAGE VALIDATED. The right pane shows the actual ASCII-box approval overlay with APPROVAL HIGH, Approve immutable Journey v1, Proposal suffix: 0000a501, Content hash: 7c4e...a501, /approve 0000a501, /reject, STAGE AWAITING_APPROVAL and footer APPROVAL_REQUIRED  Ctrl+C exit.
Style/medium: authentic Windows Terminal TUI, not a web dashboard; high-fidelity product screenshot with simple ASCII borders and restrained ANSI colors.
Composition/framing: wide landscape, left pane 50 percent and right pane 50 percent, large readable terminal text, clear left-to-right authoring-to-approval progression.
Color palette: black and charcoal terminal surfaces, soft white and light-gray text, restrained cyan for identifiers, green only for CONTRACT VALID, amber only for APPROVAL HIGH and AWAITING_APPROVAL, no decorative gradients.
Text (verbatim): "hz-agent", "HENGZHUN AGENT", "session:session-demo-0042", "journey:bank-transfer-golden", "USER> 验证复兴银行黄金转账：客户登录，转账 100.00 CNY，运营端按关联号回查。", "Candidate Journey v1", "4 steps", "8 assertions", "CONTRACT VALID", "Content hash: 7c4e...a501", "STAGE VALIDATED", "APPROVAL HIGH", "Approve immutable Journey v1", "Proposal suffix: 0000a501", "/approve 0000a501", "/reject", "STAGE AWAITING_APPROVAL", "APPROVAL_REQUIRED  Ctrl+C exit".
Constraints: preserve a real terminal look, actual TUI hierarchy, one session and one Journey across both panes, exact immutable identifiers and no execution result; keep text readable and aligned; no secrets, no host paths, no watermark.
Avoid: web cards, browser chrome, chat bubbles, source code editor, bank portal, operations console, Quality Portal, Flowise, Coze, HiAgent, model API key, password, browser screenshots, PASS, FAIL, execution, evidence artifacts, auto-approve toggle, colorful analytics, 3D decoration, glassmorphism or neon cyberpunk styling.
```

## 验证

- STATIC：用户角色、候选/校验/冻结/批准状态、功能/非功能和实际 TUI 蓝图完整。
- DESIGN_PREVIEW：仅一张当前候选图，路径和 SHA-256 与控制树一致。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行，不因生图而视为通过。

## 完成门

- 项目负责人文本确认当前候选及“校验后才能批准、批准后才可执行”的边界。
- 决定、候选路径和 SHA-256 回灌控制树与 RF-028 证据。
- 确认同时解锁 `A05-M02-S02` 与 `A05-M02-S03` 的视觉门；不执行 Journey，不改变 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-05`，或在 `VQ-05` 是当前唯一问题时明确回复 `继续`。
- 修改：`修改 VQ-05：<需要调整的终端、字段或功能>`。

确认后才生成 `VQ-06`。

## 候选记录

- 生成方式：内置 ImageGen；以 VQ-01 已确认终端区域为视觉参考，并按实际 TUI 源码结构生成一张候选；视觉检查后无需修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-05-cli-author-approve-v1.png`。
- SHA-256：`dbbdc7bd79c84ca0eb6dd14ecf57ef21dc60b445c5e6b4ac66bcd059347e1960`。
- 当前状态：`CONFIRMED`。

## 项目负责人决定

- 原文：`确认`。
- 解释：`VQ-05` 是唯一当前问题，因此记为 `CONFIRMED_AND_ADVANCE`。
- 确认时间：`2026-08-30T23:09:07+08:00`。
- 影响：仅确认设计边界并解锁 `A05-M02-S02`、`A05-M02-S03` 的视觉门；未执行 Journey，未产生浏览器证据，未改变 ReleaseIdentity。
