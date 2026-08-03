---
id: DOC-ARCH-RF004-DECISIONS
title: RF-004决策记录
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004决策记录

1. 2026-08-03：用户指示推送 RF-003（已推送 `github/RF-003`）后创建 RF-004 分支并推进。
2. RF-004 分支自 RF-003（`70cf25f`）创建；批次骨架落盘（batch.yaml PROPOSED + 9 制品）；L1 全景 RF-004 解禁登记已生效。
3. **范围未细化声明**：target-design v1.0 为草案（B1-B4 子项），经用户批准前不构成实施授权（RC-D0）。

2. 2026-08-03（S1完成）：凭据绑定考古与基线。用户批准 target-design v1.0 后执行 S1：C1-C5 现状机器断言（MCP 冻结 i3-customer、enqueueRun 持久化、验证路径 credentialRef 透传先例、schemas 类型、v7 零 credentialAlias 调用）；rf004-s1-credential-baseline.test.cjs 5/5、全聚焦 67/67、校验器×3、身份 632ad5ee、git diff --check 全过；零运行时代码改动、未读取任何凭据。**RC-D1同步链**：任务包→切片→contract-delta（S1 基线表）→batch→L2 C2 保持；无顶层冲突。下一门禁 S2（MCP 绑定契约）。
