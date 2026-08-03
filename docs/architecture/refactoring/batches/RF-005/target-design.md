---
id: DOC-ARCH-RF005-TARGET
title: RF-005目标设计——case_prepare 单路由化与 I8 草案入口退场（F07）
document_type: design
domain: architecture
status: PROPOSED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005目标设计

## 1. 现状事实（代码级，2026-08-03）

| # | 位置 | 事实 |
|---|---|---|
| C1 | `mcp/src/server.cjs` case_prepare | 双路由：`draft.schemaVersion==='hengzhun-i10-case-draft-v1' || typeof draft.credentialRef==='string'` → i10（/v1/i10/cases:prepare）；否则 i8（/v1/i8/cases:prepare + acceptanceSummaryJson 解析） |
| C2 | v7 agentflow | case_prepare 仅传 draftJson/credentialRef/journeyId（i10 草案）；draftArray/acceptanceSummaryJson/multimodalContextJson 零调用 |
| C3 | 边界合同 | case_prepare acceptedAliases 4 项：draftArray/draftJson/acceptanceSummaryJson/multimodalContextJson |
| C4 | B4-S1 错误码清单 | i8 路由相关码：I8_DRAFT_JSON_INVALID、I8_ACCEPTANCE_JSON_INVALID、I10_DRAFT_SOURCE_AMBIGUOUS（平铺字段路径）等 |
| C5 | normalizeCasePrepareRequest | 平铺草案组装（caseTitle/objective/...）+ multimodal 合并 + i8 分支（draftArray/acceptanceSummaryJson）——RF-001 B3-S3 落地 |

**结论**：v7 只走 i10 路由（draftJson 携带 i10 草案）；i8 路由与 I8 草案入口（draftArray/acceptanceSummaryJson）零消费者。

## 2. 单一变化轴

**case_prepare 单路由化**：删除 i8 路由（/v1/i8/cases:prepare 调用）与 I8 草案入口（draftArray/acceptanceSummaryJson 别名及平铺草案的 i8 分支）；保留 i10 路由与 draftJson 别名（v7 实际消费）。工具名不变。

**明确排除**：不改 Harness（/v1/i8/cases:prepare 端点保留为历史端点，仅 MCP 不再调用）；不改 Flowise；不删 33 工具名。

## 3. 目标状态（子项级）

### R1 单路由实现（MCP）
- 现状：双路由分支 + i8 分支（acceptanceSummary 解析、/v1/i8/cases:prepare 调用）
- 目标：case_prepare 只走 i10 路由；i8 草案来源（draftArray）与 acceptanceSummaryJson 从 schema 移除；平铺草案（caseTitle 等）保留（v7 未用但为公开输入面？——检查：v7 不用平铺字段；但平铺草案是 i10 草案的另一输入形态（normalizeCasePrepareRequest 的 flatDraftSupplied 分支走 i10 路由！draft 组装后 schemaVersion v1 → i10）。所以平铺字段保留（它们是 i10 草案构造输入），只退场 **i8 专属路径**：draftArray（i8 草案数组）、acceptanceSummaryJson（i8 摘要）
- 验证：单路由测试（i10 全路径 + draftArray/acceptanceSummaryJson schema 拒绝）

### R2 边界合同更新
- 现状：case_prepare aliases 4 项
- 目标：退场 draftArray/acceptanceSummaryJson/multimodalContextJson（零消费者）——等等 multimodalContextJson：v7 零调用但它是 i10 平铺草案的多模态补充（flatDraftSupplied 分支内 merge）——退场它会让平铺+多模态组合不可用。v7 零调用 → 退场（13→10 计数）。draftJson 保留（v7 消费）
- 验证：validate_rf001_contract PASS（aliases 动态 10）

### R3 错误码与断言联动
- i8 码退场：I8_DRAFT_JSON_INVALID（draftJson 仍用于 i10？draftJson 是 i10 草案 JSON——parseJsonArgument(draftJson, 'I8_DRAFT_JSON_INVALID') 的错误码名是 i8 前缀但用于 i10 草案解析！退场时改名 I10_CASE_DRAFT_INVALID 或保留？改名=新错误码。最小：保留该码名（它现在语义是"草案 JSON 无效"）或重命名登记。决策点 DP-R5-1。
- I8_ACCEPTANCE_JSON_INVALID 删除（acceptanceSummaryJson 退场）
- B4-S1 错误码清单更新（corpus 自动一致——删除后不再提取；matrix 登记退场）
- 边界合同 case_prepare 条目 canonicalRequest 更新（去 draftArray/acceptanceSummaryJson/multimodalContextJson）
- 聚焦测试更新：B3-S3 别名样本测试（case_prepare 4 别名 → 1）、S1 锚点等

### R4 生产切流关闭
- 受管重启 + 真实案例探测（case_prepare i10 路径正常）+ batch CLOSED + 全景终态达成

## 3.5 决策记录

- **DP-R5-1（用户 2026-08-03 决策）**：`I8_DRAFT_JSON_INVALID`（现用于 i10 草案 JSON 解析）**改名为 `I10_CASE_DRAFT_INVALID`**（语义准确）；`I8_ACCEPTANCE_JSON_INVALID` 随 acceptanceSummaryJson 退场删除；两者登记 matrix 与 B4-S1 清单联动。

## 4. 切片链建议

1. **RF-005-S1** 双路由考古与基线（零代码：C1-C5 现状断言、v7 消费面复核、差异表）
2. **RF-005-S2** 单路由实现（MCP case_prepare 收敛 + schema/合同更新 + 断言联动）
3. **RF-005-S3** 生产切流、观察与批次关闭（全景终态验收）

## 5. 批准要求

本设计经用户批准后成为 RF-005 唯一变化轴授权。
