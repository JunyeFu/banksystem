---
id: BANKSYSTEM-OSS-VISUAL-ACCEPTANCE-V1
title: Bank system and CLI Agent visual acceptance record
document_type: design
domain: frontend
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# 视觉问答验收记录

本目录保存 `VQ-01` 至 `VQ-08` 的候选图片、最终提示词、图片摘要和项目负责人文本决定。图片只证明设计沟通，不证明页面实现、浏览器 E2E、LIVE_E2E 或发布。

当前问题：无；`VQ-01` 至 `VQ-08` 已全部确认。

| 问题 | 候选图片 | SHA-256 | 文本决定 |
|---|---|---|---|
| VQ-01 | `vq-01-product-combination-v1.png` | `b4055244a2febe7dcad91f3d56c7407036595d8a818df4c3d85dd085adedc6cb` | CONFIRMED：`继续` |
| VQ-02 | `vq-02-customer-login-account-overview-v2.png` | `ce153c4cb3ca33bdff4fe1edd9648af883d37204e5a1df0c6c73599cabf77974` | CONFIRMED：`确认1VQ-02`（规范化为 `确认 VQ-02`） |
| VQ-03 | `vq-03-customer-transfer-result-v1.png` | `4e866daf2006ed6692c073f46460c53ce57e7fef809cdd0946b6b1c153edb4a0` | CONFIRMED：`继续` |
| VQ-04 | `vq-04-operations-transaction-lookup-v1.png` | `a0adf259715398a8b1f993b5ebfe88f6801a0e321a9d0e42d990df40d5d2ffda` | CONFIRMED：`确认` |
| VQ-05 | `vq-05-cli-author-approve-v1.png` | `dbbdc7bd79c84ca0eb6dd14ecf57ef21dc60b445c5e6b4ac66bcd059347e1960` | CONFIRMED：`确认` |
| VQ-06 | `vq-06-cli-execution-evidence-v1.png` | `ceb27df9c383cd781815a5b6fb5435b23db41542db690567e7af3161cceb0f8f` | CONFIRMED：`确认` |
| VQ-07 | `vq-07-read-only-quality-portal-v1.png` | `9bba3f163b56df153067e0980aca1a8237215fd66fe63326f920008a8e7a926d` | CONFIRMED：`确认` |
| VQ-08 | `vq-08-open-source-onboarding-interview-demo-v1.png` | `6abfa7700990b40ccdfee08beaf7204c802de021125a7c4d6eaf1d131a0b6421` | CONFIRMED：`确认` |

VQ-01 的正式质量字段名是精确的 `ReleaseIdentity`。候选图中的 AI 字形只作布局预览，不得进入实现文本。

VQ-02 v1 已被项目负责人的风格修订请求替代，保留为历史候选。v2 以已实现的 `PV-0006`、`PV-0010`、`PV-0018` 为视觉蓝图；账户字段、金额、交易时间和 AI 字形仍只作合成布局预览，实现以 VQ-02 文本合同为准。

VQ-03 v1 以已实现的 `PV-0028`、`PV-0034`、`PV-0035` 为视觉蓝图，串联客户转账表单与权威已结算结果；合成标识符用于确认关联关系，正式实现仍以 API 合同和 Fineract 回读为准。

VQ-04 v1 以已实现的 `PV-0073`、`PV-0077`、`PV-0084` 为视觉蓝图，串联运营端精确关联号查询与只读支付详情；账户掩码、合成标识符和 AI 字形用于设计沟通，正式实现仍以运营 OpenAPI、类型客户端和浏览器断言为准。

VQ-05 v1 继承实际 `hz-agent` TUI 的 header、transcript、stage、footer 与 HIGH-risk approval overlay 层级，并以 VQ-01 已确认终端区域约束 Windows Terminal 视觉；候选中的自然语言目标和合成 ID 只作交互预览，正式实现以 CLI 事件合同、风险策略和 Harness 状态为准。

VQ-06 v1 延续 VQ-05 的终端语言，以当前 CLI runtime bridge、MCP run/evidence 投影、Harness artifact store 和 Worker claim/complete 链为实现蓝图；左侧表达同一 Run 的真实浏览器执行目标，右侧表达 Harness 权威证据回读。候选中的 PASS、合成 ID、短哈希和证据卡只作设计确认，不代表浏览器已经执行，也不代表 Full18 或发布 GO。

VQ-07 v1 以 HZ-0001、HZ-0005、HZ-0009 和当前 Quality Portal 源码为视觉蓝图，仅继承衡准红黑壳层、卡片、表格与状态标签；旧 fixture 数据和历史写操作不是目标功能。候选聚焦 GET-only 运行证据详情与跨界身份一致性，明确区分 `RUN PASSED` 与 `RELEASE PENDING`。正式字段名由文本合同固定为精确的 `ReleaseIdentity`，AI 字形只作布局预览。

VQ-08 v1 以已确认的 VQ-02 客户门户、VQ-04 运营控制台、VQ-06 CLI 和 VQ-07 只读质量门户为四个视觉蓝图，组合 README 第一屏、八行 Quick Start、四个体验入口、五段 5–8 分钟演示和两类权威状态源。画面明确标注“目标体验 · 非运行证据”，不证明当前 `demo.ps1`、Full18、CI 或 Release 已完成；正式 `ReleaseIdentity` 字符串仍以文本合同为准。
