---
id: DOC-ARCH-RF005-CONTRACT-DELTA
title: RF-005合同差异（case_prepare 单路由化，F07）
document_type: contract
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005合同差异

现状（RF-001 B2 决策 7 登记）：case_prepare 同时兼容 I10、旧 I8 与平铺草案；I8 双路由保留至消费者证据门禁。

目标：依据 v7 零消费者证据（draftArray/acceptanceSummaryJson/multimodalContextJson 零调用）退场 I8 路由与 I8 草案入口；case_prepare 单路由（i10）保留 draftJson 别名；平铺草案字段保留（i10 草案构造输入）。

联动：边界合同 case_prepare acceptedAliases 4→1（aliases 13→10，动态计数）；canonicalRequest 更新；i8 专属错误码登记退场；L2 衔接点 C3（消费者审计方法论复用）与 C4（B4-S1 错误码清单更新）闭合。

## S1 基线（2026-08-03，rf005-s1-dual-route-baseline.test.cjs 5/5）

| # | 现状 | 目标（R#） |
|---|---|---|
| C1 | i10/i8 双路由分支（/v1/i10/ 与 /v1/i8/cases:prepare） | R1：单路由（i10） |
| C2 | draftArray/acceptanceSummaryJson/multimodalContextJson 在 schema | R1：退场（draftJson 保留） |
| C3 | 边界合同 aliases 4 项 | R2：1 项（13→10） |
| C4 | I8_DRAFT_JSON_INVALID（改名 I10_CASE_DRAFT_INVALID，DP-R5-1）、I8_ACCEPTANCE_JSON_INVALID（删除） | R3：联动 |
| C5 | v7 仅 draftJson/i10 路由（零 i8 调用） | 退场安全证据 |

DP-R5-1（用户 2026-08-03）：I8_DRAFT_JSON_INVALID → I10_CASE_DRAFT_INVALID 改名。
