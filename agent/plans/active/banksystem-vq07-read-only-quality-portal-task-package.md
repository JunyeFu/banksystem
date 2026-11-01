---
id: BANKSYSTEM-OSS-VQ07-READ-ONLY-QUALITY-PORTAL-001
title: Read-only Quality Portal and cross-surface identity visual confirmation
document_type: task
domain: frontend
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-07：只读 Quality Portal 与跨界身份追踪

## 业务目标

让质量负责人通过 `http://127.0.0.1:18788/quality/` 查看 Harness SQLite 的脱敏只读投影，并从同一界面确认 VQ-06 的 `Journey ID`、`Run ID`、`Correlation ID`、证据摘要和 `ReleaseIdentity` 一致。Quality Portal 只负责观察，不创作用例、不批准基线、不切换调度、不发起恢复、不触发执行，也不拥有第二份状态。

## 输入与输出

- 用户角色：本机质量负责人、面试评审者或演示观察者。
- 输入服务：Harness loopback 服务中的静态资源和 `/api/quality/v1/**` GET-only 脱敏投影。
- 状态输入：Harness SQLite 中的用例、基线、Run、调度、事件、证据和发布身份记录。
- 页面输出：7 个顶层只读入口，以及用例详情、运行证据详情两个嵌套页，共 9 个逻辑视图。
- 当前预览焦点：`运行证据详情`，展示 `bank-transfer-golden`、`run-demo-0042`、`CORR-DEMO-000042`、合成短 `ReleaseIdentity`、4 个步骤和 5 类证据。
- 安全输出：浏览器不持有 Harness service token；页面仅显示脱敏字段、证据类型、隔离状态、短哈希和只读身份状态。

## 业务常识

- Harness SQLite 是 Journey、Run、证据和发布状态的唯一真相源；Quality Portal 不缓存或拼接第二份权威状态。
- 只读不仅指 HTTP 动词为 GET，还要求页面没有会让用户误以为能够创建、批准、切换、恢复、执行或发布的控制。
- 搜索、筛选、分页、展开详情和切换标签只改变浏览器本地视图，不改变 Harness 状态。
- `Journey ID`、`Run ID`、`Correlation ID` 和 `ReleaseIdentity` 必须由同一投影返回；前端不得从 URL、时间或展示文本自行推导。
- Run `PASSED` 不等于 ReleaseIdentity 已完成 Full18，也不等于发布 `GO`；发布门可以继续显示 `PENDING`。
- 截图证据在未完成像素级脱敏验证时保持 `QUARANTINED`；只读门户不能绕过隔离或签发下载授权。

## 实现模板

```text
Harness SQLite
  -> loopback redaction projection mapper
  -> GET-only /api/quality/v1
  -> generated typed client
  -> loading | error | empty | ready state
  -> Ant Design read-only view
  -> same Journey / Run / Correlation / ReleaseIdentity
```

9 个逻辑视图：

```text
1. 平台总览
2. 质量用例
3. 用例详情
4. 基线中心
5. 回归运行
6. 运行证据详情
7. 定时计划
8. 失败与恢复
9. 交付中心
```

最小运行证据投影：

```json
{
  "journeyId": "bank-transfer-golden",
  "runId": "run-demo-0042",
  "correlationId": "CORR-DEMO-000042",
  "releaseIdentity": "7f3c...a912",
  "runStatus": "PASSED",
  "releaseGate": "PENDING",
  "artifacts": [
    {"type": "DOM_SNAPSHOT", "status": "VERIFIED"},
    {"type": "SCREENSHOT", "status": "QUARANTINED"},
    {"type": "BROWSER_TRACE", "status": "VERIFIED"},
    {"type": "NETWORK_FACTS", "status": "VERIFIED"},
    {"type": "LEDGER_READBACK", "status": "VERIFIED"}
  ]
}
```

## 项目易错点

- 当前旧截图 HZ-0001 至 HZ-0009 使用确定性浏览器 fixture，只证明 UI 视觉回归，不证明 Harness 投影已经实现。
- 旧 HZ 截图中的“知识与作者化”入口不属于当前 GET-only OpenAPI；只能继承壳层与视觉语言，不能复活旧控制面。
- 当前工作树虽已删除用例创建、基线批准和调度切换 API，但 `IncidentsPage` 仍保留“生成恢复计划/提交审批”，`ReleasesPage` 仍显示“下载证据包”；正式只读门户必须删除或替换为纯元数据。
- 当前顶层导航为 7 项，用例详情是第 8 个视图；仍需补齐由 Harness 投影驱动的运行证据详情，形成第 9 个视图。
- 当前 OpenAPI 仍声明浏览器 bearer 认证和内部演示许可证元数据；正式 loopback 公共投影不得要求 service token，项目自有许可证元数据必须统一 MPL-2.0。
- 禁止把前端 Mock、旧视觉基线或 AI 图中的合成 PASS/ReleaseIdentity 当作运行、LIVE_E2E 或发布证据。
- 禁止显示明文账号、cookie、authorization header、API key、绝对宿主路径或可绕过隔离的下载链接。

## 已实现视觉与合同蓝图

- `HZ-0001`：衡准红黑侧栏、白色内容区、顶部状态栏、KPI 与健康卡布局，SHA-256 `aef35148f1ecc921731f8ac439bdd5788b93367adfa55b91c37945671e3a3e20`。
- `HZ-0005`：回归运行表格、状态标签、进度条和密集信息层级，SHA-256 `10f300b44e7b1347ff410a27a5920bb1c41389e505bee8f7c7cecf34da43e910`。
- `HZ-0009`：交付身份、证据哈希和本机边界提示的页面构图，SHA-256 `4d105955bcfd76755116a879f10311483a77b6fb8c27b1d24fb9360450f3adc7`。
- `App.tsx`：当前 7 项顶层导航、衡准壳层和本机质量负责人身份，SHA-256 `50d8868145ec9f363b72783d8432796d55e7e9422ac6292514950145bfcd8c64`。
- `pages.tsx`：当前只读化页面、显式 QueryState 以及仍待移除的恢复/下载控制，SHA-256 `039596032aaa6a3bef2fd598ffbda07b4f08efa30a7a8821bb55db0e01862483`。
- `styles.css`：实际黑色侧栏、衡准红、浅灰工作区、白色卡片和 Ant Design 密度，SHA-256 `9f102f372c022f13ba3d4479491b662d4b3326f68157d57304f320a2dded9bec`。
- `api.ts`：当前消费者只调用 GET 列表与详情，SHA-256 `f5ea7b921af68f7ee2e77485a9b8e944e58247a4f749acd495314da44b8faa11`。
- `quality-platform-api.yaml`：当前 overview、cases、baselines、runs、schedules、incidents、releases GET 合同，SHA-256 `4bc4378267b9cc5956b605c2325e58a29924f1a932141ef244d0e7d2fa818008`。
- VQ-06 的合成 Journey/Run/Correlation 只用于跨画面身份连续性，SHA-256 `ceb27df9c383cd781815a5b6fb5435b23db41542db690567e7af3161cceb0f8f`。

## 预览功能与明确非功能

预览必须表达：

- 继承已实现衡准壳层：深黑侧栏、衡准红选中态、白色顶部栏、浅灰页面背景、白色卡片和紧凑表格。
- 顶部显示 `只读投影`、`LOOPBACK` 和 `质量负责人`，页面标题为 `运行证据详情`。
- 同一 `bank-transfer-golden`、`run-demo-0042`、`CORR-DEMO-000042` 和短 `ReleaseIdentity` 在一个身份区中出现。
- Run 状态为 `PASSED`，发布门为 `PENDING`；4 个黄金步骤通过，5 类证据显示 VERIFIED/QUARANTINED 与短 SHA-256。
- 页面明确提示“数据来自 Harness SQLite · GET only · 已脱敏”和“此门户不能执行、批准或发布”。

本轮不展示新建、编辑、批准、拒绝、开关、执行、恢复提交、发布按钮、证据下载、service token、Full18 18/18、发布 GO、Flowise、模型配置或银行凭据。

## 生图提示词

基础生成提示词：

```text
Use case: ui-mockup
Asset type: VQ-07 high-fidelity 16:9 read-only Quality Portal run evidence detail preview
Primary request: Generate one shippable full-page desktop web application screenshot for the Hengzhun Quality Portal. It must faithfully inherit the implemented portal's visual language while showing the final GET-only run evidence detail for the same synthetic golden transfer represented in VQ-06.
Input images: Image 1 is the primary shell and dashboard style reference: preserve its black sidebar, Hengzhun red selected navigation, white header, light-gray workspace, white cards, typography, spacing and restrained status colors. Image 2 is the table density and run-status style reference. Image 3 is the identity/hash presentation and information-banner style reference. These are style references only; do not copy their fixture values, Knowledge menu, download controls or historical actions.
Scene/backdrop: a full 1440x900-like application viewport with no device frame and no decorative background.
Left sidebar: near-black #171717, top brand with red square Chinese mark "衡", brand "衡准", subtitle "自动化回归测试平台". Show exactly seven top-level items: "平台总览", "质量用例", "基线中心", "回归运行", "定时计划", "失败与恢复", "交付中心". Select "回归运行" with the existing Hengzhun red background. Bottom text "收起菜单".
Top white header: left "回归运行". Right side shows a green dot with "本机运行", then small neutral badges "只读投影" and "LOOPBACK", then red circular avatar "质" and "质量负责人".
Main page: title "运行证据详情". Subtitle "Harness SQLite 权威投影 · GET only · 已脱敏". Directly below, a pale-blue information banner with exact message "只读观察：此门户不能执行、批准或发布".
Identity summary: one wide white card with four compact columns. Show exact labels and values: "Journey ID" / "bank-transfer-golden"; "Run ID" / "run-demo-0042"; "Correlation ID" / "CORR-DEMO-000042"; "ReleaseIdentity" / "7f3c...a912". Use monospaced text for values. Below or beside the IDs show a green tag "RUN PASSED" and an amber tag "RELEASE PENDING".
Middle row: left two-thirds white card titled "黄金链步骤". Four ordered rows with exact names "1 客户登录", "2 转账 100.00 CNY", "3 客户结果回读", "4 运营关联号查询"; every row has a green "PASS" tag and a thin green check indicator. Right one-third white card titled "身份一致性". Show four rows "CLI", "Harness", "Evidence", "Quality Portal", each with green status "一致". Add small note "同一身份链 · 无前端推导".
Bottom full-width white card titled "证据完整性". Render a clean compact table with columns "证据类型", "脱敏状态", "SHA-256", "完整性". Show exactly five rows: "DOM SNAPSHOT" / "REDACTED" / "21f9...7c01" / "VERIFIED"; "SCREENSHOT" / "QUARANTINED" / "6ab2...901e" / "VERIFIED"; "BROWSER TRACE" / "REDACTED" / "0c77...af42" / "VERIFIED"; "NETWORK FACTS" / "REDACTED" / "45d0...bc19" / "VERIFIED"; "LEDGER READBACK" / "REDACTED" / "8e31...2d60" / "VERIFIED". VERIFIED tags are green; QUARANTINED is amber; hashes are monospaced.
Style/medium: authentic Ant Design enterprise quality portal, matching the provided implemented Hengzhun screenshots rather than a generic dashboard. Crisp Chinese UI text, compact professional density, no glassmorphism, no shadows beyond subtle card borders.
Composition/framing: fixed black sidebar about 232 px, the main evidence view fills the remaining canvas, all key fields readable at one glance without scrolling.
Color palette: #171717 sidebar, #a6192e Hengzhun red, #f7f7f5 workspace, white cards, #287a4b success green, restrained amber for pending and quarantine, muted gray borders.
Constraints: only observation and local navigation; seven top-level navigation entries plus this nested run evidence detail represents the final read-only information architecture. Preserve one Journey, one Run, one Correlation and one ReleaseIdentity. RUN PASSED and RELEASE PENDING must both be clearly visible. The page contains only synthetic redacted values.
Avoid: "知识与作者化", new/create/edit buttons, approve/reject, switches, execute/run controls, retry controls, recovery submission, release/publish button, download evidence, action column, service token, API key, password, cookie, authorization header, account number, absolute host path, Full18, 18/18, release GO, Flowise, terminal UI, bank portal, operations console, charts, dark content cards, neon, gradients, watermark.
```

定向修订提示词：

```text
1. Change only the fourth identity-card field label to the exact verbatim text "ReleaseIdentity"; preserve every other pixel and value.
2. Keep exact "ReleaseIdentity" and render only that label in a clear compact monospaced font where capital I is visually distinct; preserve every other pixel and value.
```

正式实现必须直接使用合同字符串 `ReleaseIdentity`；AI 图中无衬线/等宽字形的 `I` 与 `l` 视觉近似不构成实现文本来源。

## 验证

- STATIC：9 个逻辑视图、只读边界、权威状态源、身份连续性、脱敏与隔离规则完整。
- DESIGN_PREVIEW：仅一张当前候选；图片路径、SHA-256、生成模式和参考摘要写入本包与 RF-028。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行；旧 HZ fixture 与新候选均不得用于升级证据等级。

## 完成门

- 项目负责人文本确认衡准既有视觉语言、9 个只读视图、运行证据详情和“Run PASS 不等于 Release GO”的边界。
- 决定、候选路径、提示词和 SHA-256 回灌控制树与 RF-028 证据。
- 确认只解锁 `A04-M02-S01`、`A04-M02-S02`、`A04-M03-S01` 的视觉门；不实现页面，不改变 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-07`，或在 `VQ-07` 是当前唯一问题时明确回复 `确认` 或 `继续`。
- 修改：`修改 VQ-07：<需要调整的页面、字段或只读边界>`。

确认后才生成 `VQ-08`。

## 候选记录

- 生成方式：内置 ImageGen；以 HZ-0001、HZ-0005、HZ-0009 为三个支持性视觉参考生成基础候选，再仅针对 `ReleaseIdentity` 标签执行两次定向字形修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-07-read-only-quality-portal-v1.png`。
- SHA-256：`9bba3f163b56df153067e0980aca1a8237215fd66fe63326f920008a8e7a926d`。
- 目视检查：7 个顶层入口正确；运行证据详情、只读/loopback/脱敏提示、同一身份链、Run PASSED/Release PENDING、4 个步骤、5 类证据和截图隔离均可见；没有写操作、下载、Full18 或 GO。
- 字形说明：正式字段由本包文本合同固定为 `ReleaseIdentity`，候选图不作为字段拼写源。
- 当前状态：`CONFIRMED`。

## 项目负责人决定

- 原文：`确认`。
- 解释：`VQ-07` 是唯一当前问题，因此记为 `CONFIRMED_AND_ADVANCE`。
- 确认时间：`2026-08-31T09:22:45+08:00`。
- 影响：仅确认只读质量门户、九个逻辑视图和跨界身份链的设计边界，并解锁 `A04-M02-S01`、`A04-M02-S02`、`A04-M03-S01` 的视觉门；未实现投影 API 或页面，未产生 LIVE_E2E 或发布证据，未改变 ReleaseIdentity。
