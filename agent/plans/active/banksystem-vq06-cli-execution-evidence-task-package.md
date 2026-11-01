---
id: BANKSYSTEM-OSS-VQ06-CLI-EXECUTION-EVIDENCE-001
title: CLI browser execution and terminal evidence visual confirmation
document_type: task
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-06：CLI 真实浏览器执行与终端证据

## 业务目标

让测试工程师在 `hz-agent` 中批准冻结的 `bank-transfer-golden` Journey 后，明确看到 Controller 只经 MCP 请求 Harness 排队，Worker 领取同一 Run 并用 Playwright/Midscene 操作复兴银行真实页面；执行完成后，CLI 从 Harness 权威回读同一 Journey、Run、Correlation 和脱敏证据摘要，使“浏览器确实执行过”和“结果可复核”在终端中可观察。

## 输入与输出

- 用户角色：已经完成 VQ-05 精确批准的本机测试工程师或演示操作者。
- 执行输入：不可变 `journeyId=bank-transfer-golden`、批准修订 `v1` 与一次显式执行动作。
- 前置条件：唯一模型绑定、MCP、Harness、Worker、浏览器和银行服务均就绪；凭据仅以 Harness 登记的引用解析。
- 运行输出：`runId=run-demo-0042`、`correlationId=CORR-DEMO-000042`、四个黄金链步骤状态和终态 `PASSED`。
- 证据输出：DOM 快照、截图、浏览器 trace、网络事实与账务回读的 artifact card；每项只显示类型、脱敏状态、摘要和 SHA-256，不显示宿主绝对路径或敏感原文。
- CLI 输出：执行成功退出码 `0`；该退出码只代表本次 Run 成功，不代表 Full18 或发布 `GO`。

## 业务常识

- Agent Controller 不直接控制浏览器，也不写 Harness SQLite；它通过 MCP 提交正式动作并在写后回读权威状态。
- `run_submit` 只允许已批准、已激活的冻结版本进入 Harness；Worker 只领取 Harness 创建的 task。
- 银行业务断言必须比较 Customer Portal、Operations Console 与 Fineract 权威结果中的金额、币种、状态和 `correlationId`，不能以页面提示文字替代账务回读。
- 浏览器运行成功与证据完整是两个门：缺任一必需 artifact、摘要不匹配或哈希回放失败时，证据验证必须失败。
- 截图可能包含渲染后的敏感文本；当前 Harness 对 Worker 截图强制隔离，终端可显示哈希和隔离状态，但不能绕过下载门。
- `PASSED` 是 Run 结果；ReleaseIdentity、Full18 和验证器拥有的 `GO` 属于后续 A06，不在本轮产生。

## 实现模板

```text
approved immutable Journey revision
  -> hz-agent explicit execute
  -> Controller proposes exact run_submit
  -> MCP validates and calls Harness
  -> Harness enqueues Run + task in SQLite
  -> Worker claims task
  -> Playwright/Midscene operates Customer Portal and Operations Console
  -> Gateway -> Bank Channel -> Fineract provides bank truth
  -> Worker completes task with redacted evidence payloads
  -> Harness atomically stores Run result + artifact metadata + SHA-256
  -> CLI /evidence reads the authoritative Journey projection through MCP
  -> PASSED | FAILED | BLOCKED; evidence verify PASS | FAIL
```

最小终端投影：

```json
{
  "journeyId": "bank-transfer-golden",
  "runId": "run-demo-0042",
  "correlationId": "CORR-DEMO-000042",
  "status": "PASSED",
  "artifacts": [
    {"type": "DOM_SNAPSHOT", "redactionStatus": "REDACTED", "sha256": "..."},
    {"type": "SCREENSHOT", "redactionStatus": "QUARANTINED", "sha256": "..."},
    {"type": "TRACE", "redactionStatus": "REDACTED", "sha256": "..."},
    {"type": "NETWORK_FACTS", "redactionStatus": "REDACTED", "sha256": "..."},
    {"type": "LEDGER_READBACK", "redactionStatus": "REDACTED", "sha256": "..."}
  ],
  "evidenceVerification": "PASS",
  "exitCode": 0
}
```

## 项目易错点

- 禁止 CLI 或 Controller 绕过 MCP 直连 Worker、浏览器、SQLite 或 Fineract。
- 禁止把模型规划成功、终端动画、录制截图或前端 Mock 当作真实浏览器执行。
- 禁止 Worker 自行发明 Journey/Run/Correlation ID；所有边界必须携带 Harness 已登记的同一标识。
- 禁止只保存截图而缺 DOM、trace、网络事实和账务回读；也禁止仅登记元数据而不保存可校验内容。
- 禁止在证据中保存密码、API key、cookie、authorization header、完整账号或宿主绝对路径。
- 首次确定性执行失败必须形成明确 `FAILED` 或 `BLOCKED` 并停止，不得隐藏重试、切换模型或伪装退出码 `0`。
- AI 图中的合成 ID、短哈希和 PASS 文本只作目标交互预览，不是运行证据。

## 已实现交互与证据蓝图

- `agent-cli/tui/view.mjs`：header、transcript、stage 和 footer 的实际终端布局，SHA-256 `a414e2da10e66e9e00f981e2a336c3cf798441ba2ec6d05ded78cd091cbd3b07`。
- `agent-cli/tui/runtime-bridge.mjs`：TUI 意图、Controller 结果、`/evidence` 权威回读与稳定退出行为，SHA-256 `c72ea8f68105f1ea5227a33ce768ea5a7d6ac2e1c60f643aa25981ba0d1f69d9`。
- `agent-cli/src/production-service.mjs`：MCP Journey 读取、证据 artifact card 脱敏投影和安全字段边界，SHA-256 `7870252b44763f5022633f6dacff89ad2463d38a9b6a852b450005098c4b6244`。
- `mcp/src/server.cjs`：`run_submit`、`journey_get` 与 artifact 下载授权的现有 MCP 表面，SHA-256 `7af79675c21cd64136bf101ec632f6be9655a5eed67d54939e55c18de73fa8f4`。
- `mcp/src/journey-evidence-projection.cjs`：Run 引用和最多 16 个证据卡片的有界投影，SHA-256 `328015e66c59029dd7732d1cb2d056c1da29640eefc074c2a7ffa1a2246c8494`。
- `harness/src/artifact-store.ts`：Artifact 内容摘要、相对路径、隔离状态与读取时哈希复验，SHA-256 `c523a3bb1a1c0ff3bca29bbbbabee192481a69603ae29df5e13ea54b92fc1f2c`。
- `worker/src/index.cjs`：Harness task claim、受控执行器、完成回写以及 `PASSED`、`FAILED`、`BLOCKED` 分流，SHA-256 `d4b8bf5b65e834a44af0bfe8fa11b78db370cd012a9a50b16462967f9ee255ac`。
- VQ-05 已确认图仅作为同一 Windows Terminal、会话与 Journey 的视觉延续，不复制批准 modal，SHA-256 `dbbdc7bd79c84ca0eb6dd14ecf57ef21dc60b445c5e6b4ac66bcd059347e1960`。

这些源码证明可复用的现状边界，不等于 A05-M03 已完整实现；VQ-06 表达的是落地后的目标交互。

## 预览功能与明确非功能

预览必须同时表达：

- 执行态：同一 `session-demo-0042` 与 `bank-transfer-golden`，`STAGE RUNNING`，Controller、MCP、Harness、Worker 和 Playwright/Midscene 依次可观察，四个黄金链步骤显示确定状态。
- 完成态：`STAGE COMPLETED`、`RUN PASSED`、同一 `run-demo-0042` 与 `CORR-DEMO-000042`，五类证据均有脱敏/隔离状态和短 SHA-256，`EVIDENCE VERIFIED` 与 `Exit code: 0`。
- 左右两态必须清楚表达一次真实浏览器 Run 从排队、领取、页面动作到 Harness 权威证据回读的连续链。

本轮不展示 Quality Portal、ReleaseIdentity、Full18、发布 `GO`、自动重试、自动修复、备用模型、Flowise、模型密钥、银行凭据、原始 cookie/header、绝对文件路径或证据下载按钮。

## 生图提示词

```text
Use case: ui-mockup
Asset type: VQ-06 high-fidelity 16:9 hz-agent real browser execution and terminal evidence preview
Primary request: Generate one focused Windows Terminal product preview for the open-source CLI testing Agent hz-agent. Image 1 is a supporting style reference only: preserve its exact authentic Windows Terminal mood, near-black monospaced TUI, top header, transcript, stage, footer, thin central divider, crisp ASCII borders, restrained cyan/green/amber status colors and generous readable spacing. Do not preserve the approval modal. Show two adjacent time states of the same already-approved Journey and same Run: live browser execution on the left, authoritative Harness evidence readback on the right.
Scene/backdrop: one large clean Windows Terminal window on a dark Windows 11 desktop, two equal terminal panes, no browser window and no web dashboard.
Left pane header, verbatim: "HENGZHUN AGENT", "session:session-demo-0042", "journey:bank-transfer-golden".
Left pane transcript and stage: show "SYSTEM> APPROVAL RESOLVED" and "SYSTEM> run_submit accepted". Then a simple ASCII execution box headed "REAL BROWSER RUN". Show pipeline "Controller -> MCP -> Harness -> Worker -> Playwright/Midscene" and bank route "Portal -> Gateway -> Bank Channel -> Fineract". Show "Run ID: run-demo-0042". Show four progress rows exactly: "[1/4] Customer login          PASS", "[2/4] Transfer 100.00 CNY     PASS", "[3/4] Customer readback       RUNNING", "[4/4] Operations lookup       QUEUED". Show "STAGE RUNNING". Footer: "WORKING  Ctrl+C exit".
Right pane header, verbatim: "HENGZHUN AGENT", "session:session-demo-0042", "journey:bank-transfer-golden".
Right pane transcript and stage: show "SYSTEM> /evidence bank-transfer-golden". Then a large simple ASCII evidence box headed "RUN PASSED" and "EVIDENCE VERIFIED". Show "Journey ID: bank-transfer-golden", "Run ID: run-demo-0042", "Correlation ID: CORR-DEMO-000042". Show five evidence rows with short synthetic hashes: "DOM SNAPSHOT     REDACTED     sha256:21f9...7c01", "SCREENSHOT       QUARANTINED  sha256:6ab2...901e", "BROWSER TRACE    REDACTED     sha256:0c77...af42", "NETWORK FACTS    REDACTED     sha256:45d0...bc19", "LEDGER READBACK  REDACTED     sha256:8e31...2d60". Show "Exit code: 0", "STAGE COMPLETED". Footer: "READY  Ctrl+C exit".
Style/medium: authentic shippable terminal TUI screenshot, not concept art and not a website. Large readable JetBrains-Mono-like text, clean ASCII boxes, realistic Windows Terminal title bar with hz-agent tab.
Composition/framing: wide 16:9, exact 50/50 split, full terminal visible, text centered vertically with clear left-to-right execution-to-evidence progression.
Color palette: near-black and charcoal surfaces; soft white and light gray text; cyan only for identifiers and pipeline names; green only for PASS, RUN PASSED and EVIDENCE VERIFIED; amber only for RUNNING, QUEUED and WORKING; no red because this is the successful target state.
Constraints: one session, one Journey, one Run and one correlation chain across both panes; keep all listed text readable and aligned; evidence is metadata-only with short synthetic hashes; screenshot remains QUARANTINED; Exit code 0 means only this Run passed. No secrets, no credentials, no tokens, no absolute host paths, no watermark.
Avoid: approval modal, authoring form, browser screenshot, bank portal UI, operations console UI, Quality Portal, ReleaseIdentity, Full18, release GO, Flowise, Coze, HiAgent, API keys, passwords, cookies, authorization headers, evidence download button, retry, repair, alternate model, mock badge, chat bubbles, source editor, colorful analytics, 3D decoration, glassmorphism, gradients, neon cyberpunk styling.
```

## 验证

- STATIC：角色、执行链、权威状态源、证据类型、脱敏边界和 Run/Release 区分完整。
- DESIGN_PREVIEW：仅生成一张当前候选；图片路径、SHA-256、生成模式和源参考摘要写入本包与 RF-028。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行；图中的步骤、状态和哈希不得用作这些证据。

## 完成门

- 项目负责人文本确认“批准后才执行、Harness 是唯一 Run/证据状态源、Worker 真实操作页面、证据可哈希复验、Run PASS 不等于发布 GO”的画面边界。
- 决定、候选路径、提示词和 SHA-256 回灌控制树与 RF-028 证据。
- 确认只解锁 `A05-M03-S01` 与 `A05-M03-S02` 的视觉门；不执行浏览器，不改变 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-06`，或在 `VQ-06` 是当前唯一问题时明确回复 `继续` 或 `确认`。
- 修改：`修改 VQ-06：<需要调整的执行步骤、终端字段或证据>`。

确认后才生成 `VQ-07`。

## 候选记录

- 生成方式：内置 ImageGen；以 VQ-05 已确认终端图作为唯一支持性视觉参考，按当前 CLI/MCP/Harness/Worker/Artifact 源码边界生成一张候选；目视检查后无需修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-06-cli-execution-evidence-v1.png`。
- SHA-256：`ceb27df9c383cd781815a5b6fb5435b23db41542db690567e7af3161cceb0f8f`。
- 目视检查：同一 session/Journey/Run/Correlation 连续；执行中与已完成两态清楚；五类证据、截图隔离和退出码可见；未出现 ReleaseIdentity、Full18、GO、密钥、凭据或绝对路径。
- 当前状态：`CONFIRMED`。

## 项目负责人决定

- 原文：`确认`。
- 解释：`VQ-06` 是唯一当前问题，因此记为 `CONFIRMED_AND_ADVANCE`。
- 确认时间：`2026-08-30T23:46:37+08:00`。
- 影响：仅确认目标交互并解锁 `A05-M03-S01`、`A05-M03-S02` 的视觉门；未实际执行 Worker 或浏览器，未生成正式证据，未改变 ReleaseIdentity。
