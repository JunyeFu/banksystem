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
