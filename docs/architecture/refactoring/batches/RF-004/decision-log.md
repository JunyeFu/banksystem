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

3. 2026-08-03（S2完成，DP-S4-1=A）：MCP 凭据注入退场。**DP-S4-1**（target-design B1 假设 MCP 解析 credentialRef 与事实冲突——case 权威凭据在 Harness 侧且端点 credentialAlias 必填）：用户批准选 A（凭据解析所有权归 Harness，与 RF-002 同哲学）。normalizeCredentialBinding 变更为默认不注入（legacy=false 返回空绑定+审计摘要）；`HENGZHUN_RF004_LEGACY_CREDENTIAL=1` 为唯一 i3-customer 注入通道；run_submit/schedule_create 默认请求不携带 credentialAlias（条件装配）。边界合同 until 更新（13 别名计数不变、校验器 PASS）。S1 C1 锚点翻转（注入→停注入+LEGACY 分支）；B3-S3 冻结断言更新；rf004-s2-mcp-credential-exit.test.cjs 3/3；全聚焦 70/70、校验器×3、身份 632ad5ee、git diff --check 全过。**RC-D1同步链**：任务包→切片→target-design（B1 修正登记）→contract-delta→L2 C2 推进→batch；无顶层冲突。下一门禁 S3（Harness 端点解析）。

4. 2026-08-03（S3完成，DP-S4-2=A）：Harness 端点凭据解析。i8RunSubmitSchema/i8ScheduleCreateSchema credentialAlias 可选化（S2 停注入后必须）；enqueueRun 可空化（runs.credential_alias 写 NULL、payload 条件携带、claim isI10Candidate 透传 credentialRef 覆盖执行凭据——Worker 零改动）；submitI8Run/createI8Schedule 从 case definition.credentialRef 权威解析（DP-S4-2=A：无注入且 case 无凭据 → 失败关闭 I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED 入 matrix）；schedules NOT NULL 列存 credref:<hash12> 派生占位（凭据永不落库）。S1 C2 锚点翻转（可空化）。rf004-s3-harness-credential-resolution.test.cjs 5/5（无注入解析/失败关闭/LEGACY/占位/凭据不落库）；全聚焦 75/75、校验器×3、TS 0 错误、身份 632ad5ee、git diff --check 全过；零 SQLite 迁移。**RC-D1同步链**：任务包→切片→target-design（B2 修正）→contract-delta→matrix（新错误码）→L2 C2 闭合→batch；无顶层冲突。下一门禁 S4（生产切流关闭，RF-005 解禁）。
