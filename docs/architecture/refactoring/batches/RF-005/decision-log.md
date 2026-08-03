---
id: DOC-ARCH-RF005-DECISIONS
title: RF-005决策记录
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005决策记录

1. 2026-08-03：用户指示推送 RF-004（已推送 `github/RF-004`）后创建 RF-005 分支并启动。
2. RF-005 分支自 RF-004（`d914998`）创建；批次骨架落盘（batch.yaml PROPOSED + 9 制品）；L1 全景 RF-005 解禁登记已生效。
3. **范围未细化声明**：target-design v1.0 为草案（R1-R4 子项），经用户批准前不构成实施授权（RC-D0）。

2. 2026-08-03（S1完成）：双路由考古与基线。用户批准 target-design v1.0 并决策 DP-R5-1（I8_DRAFT_JSON_INVALID → I10_CASE_DRAFT_INVALID 改名）。S1：C1-C5 现状机器断言（双路由分支、i8 草案输入、边界合同 aliases 4 项、i8 错误码、v7 零 i8 调用复核）；rf005-s1-dual-route-baseline.test.cjs 5/5、全聚焦 80/80、校验器×3、身份 632ad5ee、git diff --check 全过；零运行时代码改动。**RC-D1同步链**：任务包→切片→contract-delta（S1 基线表）→target-design（DP-R5-1）→batch→L2 C3/C4 保持；无顶层冲突。下一门禁 S2（单路由实现+改名）。

3. 2026-08-03（S2完成）：case_prepare 单路由实现。R1：适配器 normalizeCasePrepareRequest 删 draftArray 分支与 multimodal 合并；server.cjs case_prepare 删 i8 路由分支（无条件 normalizeI10NaturalDraft + /v1/i10/cases:prepare），schema 移除 draftArray/acceptanceSummaryJson/multimodalContextJson（v7 零消费者证据）。DP-R5-1：I8_DRAFT_JSON_INVALID → I10_CASE_DRAFT_INVALID（改名，语义准确）；I8_ACCEPTANCE_JSON_INVALID 与 normalizeCaseAcceptanceSummary 随退场删除。R2：边界合同 case_prepare aliases 4→1（仅 draftJson→draft）、canonicalRequest 更新（**aliases 13→10** 动态，validate_rf001_contract PASS）。R3：matrix 登记 RF005-NEW-001/RF005-RETIRED-001；B3-S3 别名样本更新（删 3 项保留 draftJson）、S1 C1/C2/C3/C4 锚点翻转、B4-S1/S4/rf004-s2 联动断言更新（aliases 10）。rf005-s2-single-route.test.cjs 3/3（适配器新码名+静态+隔离运行态 i10 链路）；全聚焦 81/81、校验器×3、身份 632ad5ee、git diff --check 全过。**RC-D1同步链**：任务包→切片→contract-delta（R1/R2/R3）→target-design（DP-R5-1 已记录）→matrix→L2 C3/C4 闭合→batch；无顶层冲突。下一门禁 S3（生产切流关闭，全景终态验收）。
