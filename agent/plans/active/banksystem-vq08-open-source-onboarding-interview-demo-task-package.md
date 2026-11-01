---
id: BANKSYSTEM-OSS-VQ08-OPEN-SOURCE-ONBOARDING-001
title: Open-source onboarding and interview demo visual confirmation
document_type: task
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-31
owner: project-owner
---

# VQ-08：开源上手与面试演示

## 业务目标

让第一次打开仓库的新用户和面试评审者在 README 第一屏理解两个可独立使用、可联合演示的产品：复兴银行演示系统与 `hz-agent` CLI 自动化测试 Agent；随后仅用根命令完成准备、启动、黄金链、验证和停止，并在 5–8 分钟内看到客户转账、运营回读、Agent 真实浏览器执行和只读证据回读的同一身份链。

## 输入与输出

- 用户角色：开源使用者、贡献者、面试评审者和发布审核者。
- 输入环境：全新 Windows 11、Docker Desktop、固定 Node/Java/Playwright 依赖和唯一 BYOK OpenAI-compatible 模型配置。
- 输入入口：根 `README.md`、未来根 `demo.ps1`、架构说明、贡献/安全/许可证文档和 5–8 分钟演示脚本。
- 产品入口：Customer Portal、Operations Console、`hz-agent` CLI、Quality Portal。
- 可观察输出：服务地址与健康、银行黄金链结果、同一 Journey/Run/Correlation/ReleaseIdentity、证据摘要和发布门判定。
- 当前预览输出：README 首屏式产品说明、五分钟命令、四个体验入口、五段现场演示时间线和权威边界。

## 业务常识

- 开源第一屏先回答“这是什么、为什么可信、如何运行、能看到什么”，内部治理文档不能成为上手前置阅读。
- Fineract 只对银行账务事实负责；Harness SQLite 只对 Journey、Run、证据和发布状态负责。
- 演示必须现场运行：客户转账、运营回读、浏览器执行和证据验证不能用录屏、Mock、fixture 或 AI 图片冒充。
- `demo.ps1 verify` 和 ReleaseIdentity 验证器决定发布门；README 徽章、截图、Git 推送或口头说明不能决定 `GO`。
- 用户只配置一个 BYOK 模型；文档不得要求 Flowise、Coze、HiAgent、第二模型、数据库脚本或开发机绝对路径。
- 演示账户只能是合成数据；密钥、cookie、令牌、存储状态和真实个人信息不进入 README、截图或证据。

## 实现模板

```text
README first screen
  -> two-product promise and truth-source boundary
  -> Windows 11 prerequisites and one BYOK model
  -> demo.ps1 prepare | up | status | run-golden-path | verify | down
  -> Customer Portal -> Gateway -> Bank Channel -> Fineract
  -> hz-agent -> Controller -> MCP -> Harness -> Worker -> browser
  -> Harness SQLite + redacted evidence -> read-only Quality Portal
  -> Full18 + cold replay + CI -> release validator -> v1.0.0
```

五段现场演示：

```text
00:00-01:00  clone, prepare, up, status
01:00-03:00  客户登录并转账 100.00 CNY
03:00-04:00  运营端用同一 Correlation ID 回读账务结果
04:00-06:00  hz-agent author, validate, approve, execute
06:00-08:00  evidence verify, Quality Portal, release verify
```

## 项目易错点

- 当前根 `README.md` 仍描述历史外网演示/回归平台，并写有 Ubuntu 24.04 测试口径；它不是目标 Windows 11 双产品上手页。
- 当前根 `demo.ps1`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`CHANGELOG.md` 和 `ROADMAP.md` 尚不存在；预览只能定义目标体验，不能描述为已实现。
- 当前目录仍有以 Flowise 为唯一入口的历史 README 和文档；A08 必须链接当前产品基线，不能把历史运行方式放回 Quick Start。
- 现有 VQ 图片包含合成金额、ID、PASS 或 ReleaseIdentity；它们只提供已确认的视觉语言和页面关系，不能成为 README 的当前运行证据。
- 禁止展示虚构 GitHub star/fork 数、绿色 CI 徽章、公开 Release URL、`18/18`、`GO` 或当前版本号，除非对应正式证据真实存在并绑定同一 ReleaseIdentity。
- 禁止在上手页粘贴模型 API Key、银行密码、service token、绝对宿主路径或数据库连接串。

## 已确认视觉与目标蓝图

- `VQ-02`：已实现 Customer Portal 风格下的登录与账户总览，SHA-256 `ce153c4cb3ca33bdff4fe1edd9648af883d37204e5a1df0c6c73599cabf77974`。
- `VQ-04`：已实现 Operations Console 风格下的关联号查询与账务详情，SHA-256 `a0adf259715398a8b1f993b5ebfe88f6801a0e321a9d0e42d990df40d5d2ffda`。
- `VQ-06`：已确认 Windows Terminal 风格下的 CLI 执行与 Harness 证据回读，SHA-256 `ceb27df9c383cd781815a5b6fb5435b23db41542db690567e7af3161cceb0f8f`。
- `VQ-07`：已确认衡准红黑壳层下的 GET-only Quality Portal，SHA-256 `9bba3f163b56df153067e0980aca1a8237215fd66fe63326f920008a8e7a926d`。
- 当前根 `README.md` 仅用于识别迁移缺口，SHA-256 `fae6d5c532c5272d1a8f24c8fe9f586a2d2087cd593907590d575c64ff8b3f5f`。
- 当前开源双产品基线，SHA-256 `3277e97dabebdf8abb018a66c3fc20a0de5d49431a212333a819fe5562219c27`。

## 预览功能与明确非功能

预览必须表达：

- README 首屏使用复兴银行红色品牌、白色内容区、深色终端和衡准红黑视觉，四个产品入口与此前确认页面可对应。
- 标题明确“开源银行演示系统 + CLI 自动化测试 Agent”，并将 Windows 11、Docker Desktop、MPL-2.0、BYOK 作为环境/许可证标签。
- 五分钟命令块逐行显示 `prepare`、`up`、`status`、`run-golden-path`、`verify`、`down`。
- 四张入口卡分别为“客户门户”“运营控制台”“hz-agent CLI”“只读质量门户”，说明各自的唯一动作和可观察结果。
- 五段 00:00–08:00 时间线串起新克隆、转账、运营回读、Agent 执行、证据/发布验证。
- 底部明确 `Fineract = 银行账务真相`、`Harness SQLite = 测试与证据真相`、`Flowise = 非运行依赖`，并把 Full18、冷启动、CI 表达为发布条件而非当前通过结果。

本轮不展示 GitHub star/fork 数、绿色 CI、Full18 `18/18`、Release `GO`、真实 ReleaseIdentity、真实仓库 URL、下载按钮、API key、凭据、账号、cookie、令牌、开发机绝对路径、Flowise 启动步骤或运行时 Mock。

## 生图提示词

```text
Use case: ui-mockup
Asset type: VQ-08 high-fidelity 16:9 open-source README first-screen and interview-demo onboarding preview
Primary request: Generate one polished desktop browser screenshot of the target README first screen for a complete open-source bank demo plus a real CLI browser-testing Agent. This is the final onboarding experience preview, composed from four already confirmed product surfaces. It must feel immediately runnable and interview-grade while clearly avoiding fabricated current release results.
Input images: Image 1 is the implemented Customer Portal style reference: reuse only the red bank mark, white canvas, compact Chinese enterprise typography and red primary accent. Image 2 is the implemented Operations Console style reference: reuse only its black sidebar/red selection language and dense audit presentation. Image 3 is the confirmed hz-agent Windows Terminal style reference: reuse its dark terminal, monospace typography and cyan/green status accents, but do not copy its synthetic IDs or PASS result. Image 4 is the confirmed read-only Quality Portal style reference: reuse its Hengzhun red-black shell, white cards and read-only evidence density, but do not copy its synthetic IDs, hashes or status values.
Scene/backdrop: a full 1536x960-like browser viewport displaying a repository README/landing page, no device frame, no GitHub star or fork counters.
Top navigation: white header with the red geometric Fuxing bank mark and exact title "复兴银行 × 衡准 hz-agent". Right-aligned simple text links "架构", "快速开始", "演示路径", "贡献". Under the header, show four small neutral badges exactly "MPL-2.0", "Windows 11", "Docker Desktop", "BYOK"; these are capability labels, not green status badges.
Hero: large exact Chinese headline "开源银行演示系统 + CLI 自动化测试 Agent". Subtitle exactly "真实账务链路、真实浏览器执行、可验证证据，同一套本机演示". A small amber outline tag says "目标体验 · 非运行证据". No CTA button that implies a release download.
Quick-start area: left half is a dark Windows PowerShell terminal card titled "五分钟启动" with these exact lines, verbatim and in order: "git clone <repository>", "cd banksystem", ".\\demo.ps1 prepare", ".\\demo.ps1 up", ".\\demo.ps1 status", ".\\demo.ps1 run-golden-path", ".\\demo.ps1 verify", ".\\demo.ps1 down". Use clean monospace white text; red prompt marks only, no output claiming success.
Product map: right half is a two-by-two grid of compact visual cards matching the references. Card 1 exact title "客户门户" and caption "登录 · 账户 · 转账" with a miniature white/red bank dashboard. Card 2 exact title "运营控制台" and caption "同一关联号回读" with a miniature black-sidebar audit table. Card 3 exact title "hz-agent CLI" and caption "author · approve · execute" with a miniature dark terminal. Card 4 exact title "只读质量门户" and caption "Run · Evidence · ReleaseIdentity" with a miniature red-black quality dashboard. Keep thumbnails schematic and do not include amounts, account numbers, hashes, PASS, GO or IDs.
Demo timeline: below, one wide white card titled "5–8 分钟现场演示" with five connected numbered steps and exact labels: "1 新克隆启动", "2 客户转账", "3 运营回读", "4 Agent 执行", "5 证据与发布验证". Add compact time labels "00:00", "01:00", "03:00", "04:00", "06:00–08:00". Use a thin red progress line, not a completed progress bar.
Truth boundary footer: three compact statements in one pale-gray strip: exact "Fineract = 银行账务真相", exact "Harness SQLite = 测试与证据真相", exact "Flowise = 非运行依赖". To the right show a restrained release-condition note exactly "Full18 + 冷启动 + CI → 发布验证器" with no pass checkmark.
Style/medium: shippable open-source documentation landing page, cohesive with the provided implemented bank and Hengzhun product surfaces, enterprise-clean rather than marketing-glossy. Crisp Chinese text, subtle 1px borders, white and very light gray cards, red bank accent, near-black terminal, restrained cyan/green only inside terminal syntax.
Composition/framing: all hero, command block, four product cards, timeline and truth boundary fit in one viewport without scrolling. Strong hierarchy and generous but efficient spacing.
Color palette: white, #f7f7f5, bank red #e60012, Hengzhun red #a6192e, near-black #171717, navy-black terminal, muted gray borders.
Constraints: target design only; communicate one reproducible command path and two distinct products. Preserve the existing product visual languages from the four references without copying their fixture data. Make every visible claim compatible with the fact that demo.ps1 and release proof are not yet implemented. Use only synthetic generic labels.
Avoid: GitHub stars, forks, green CI badge, 18/18, release GO, current version number, real ReleaseIdentity, public repository URL, download release button, API key, password, cookie, token, account number, customer name, amount, correlation ID, hash, absolute host path, Ubuntu/Linux prerequisite, Flowise startup, Coze, HiAgent, database script, mock, fixture, recorded demo, mobile layout, glassmorphism, gradients, neon, decorative illustration, watermark.
```

## 验证

- STATIC：双产品定位、唯一 Quick Start、五段演示、两类真相源、非 Flowise 运行边界和发布条件无冲突。
- DESIGN_PREVIEW：只选择一张当前候选；图片路径、SHA-256、生成模式、四个参考摘要和目视检查落盘。
- CONTRACT / INTEGRATION / LIVE_E2E：本问答不执行；预览不能证明 `demo.ps1`、门户、CLI、Full18、CI 或 Release 已完成。

## 完成门

- 项目负责人文本确认 README 第一屏、五分钟命令、四个入口、5–8 分钟演示顺序和真相源边界。
- 决定、候选路径、最终提示词和 SHA-256 回灌控制树与 RF-028 证据。
- 确认只解锁 `A08-M01-S01`、`A08-M02-S01`、`A08-M02-S02` 的视觉门；不实现文档、脚本或发布，不改变 ReleaseIdentity。

## 确认合同

- 确认：`确认 VQ-08`，或在 `VQ-08` 是当前唯一问题时明确回复 `确认` 或 `继续`。
- 修改：`修改 VQ-08：<需要调整的上手页、命令、演示顺序或边界>`。

VQ-08 是最后一个视觉问题；确认后只关闭 RF-028 的视觉问答切片，不自动进入 A08 实现或发布。

## 候选记录

- 生成方式：内置 ImageGen；以 VQ-02、VQ-04、VQ-06、VQ-07 作为四个支持性风格参考生成基础候选，再仅将 `hz-agent CLI` 缩略终端中的合成 session/Journey 与错误动作顺序替换为三行无身份工作流。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-08-open-source-onboarding-interview-demo-v1.png`。
- SHA-256：`6abfa7700990b40ccdfee08beaf7204c802de021125a7c4d6eaf1d131a0b6421`。
- 目视检查：双产品标题、四个环境/许可证标签、八行 PowerShell Quick Start、四个产品入口、五段 00:00–08:00 演示时间线和三个权威边界均可见；没有 GitHub 计数、绿色 CI、18/18、GO、真实身份、密钥、凭据、绝对路径或 Flowise 启动步骤。
- 字形说明：正式字段由本包文本合同固定为精确的 `ReleaseIdentity`；候选缩略图中的 AI 字形不作为字段拼写源。
- 当前状态：`CONFIRMED`。

## 项目负责人决定

- 原文：`确认`。
- 解释：`VQ-08` 是唯一当前问题且是最后一个视觉问题，因此记为 `CONFIRMED_AND_COMPLETE_SEQUENCE`。
- 确认时间：`2026-08-31T09:38:07+08:00`。
- 影响：仅确认 README 第一屏、八行 Quick Start、四个产品入口、5–8 分钟演示顺序和真相源边界，并解锁 `A08-M01-S01`、`A08-M02-S01`、`A08-M02-S02` 的视觉门；未实现 README、`demo.ps1` 或发布资产，未产生 Full18、CI、LIVE_E2E 或 Release 证据，未改变 ReleaseIdentity。
