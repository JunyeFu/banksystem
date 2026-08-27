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

4. 2026-08-03（S3完成，**RF-005批次CLOSED，L1重构全景终态达成**）：生产切流、观察与批次关闭。受管 stop→start-i10.ps1（新 MCP 加载 case_prepare 单路由）；四服务健康、探针 mock=false、发布回读三项 Hash 与基线一致。生产探测：case_prepare（draftJson i10 草案）→ i10 链路领域校验信封（无 MCP 层错误）；task_get/schedule_get/verification_get 规范 8 字段信封；run_submit 无注入+credentialRef → 202。观察：身份 632ad5ee、18 链 18/18、影子关闭、版本 10.1.0 一致。批次关闭：batch.yaml PROPOSED→CLOSED（validate_refactoring PASS）、v54 RF-005 条目+**全景终态声明（8/8 指标全达成）**、backlog RF-005 DONE、L2 C3/C4 闭合。**RC-D1同步链**：任务包→切片→batch（CLOSED）→v54（全景终态）→backlog→L2；无顶层冲突。**L1 重构全景（RF-000~005）全部 CLOSED**：终态指标 8/8（状态推断 0、条件副作用 0、重复入口 0、状态语义可验证 100%、缺陷归属全关闭、版本来源 1、凭据绑定 100%、兼容层退场 100%）；控制体系（RC-D0/RC-D1/四级细化链）全程执行；正式环境运行中。

5. 2026-08-03（18链真实重跑授权）：用户选择方案 B（强制真实重跑 18 链）。按纪律登记：现有 18 链账本记录（身份 632ad5ee，2026-08-02 基线验收产物）将按设计内机制标记 HISTORICAL_STALE 归档（原文件备份，不删除），使 existingTerminal 短路失效；随后执行 9 案例 × 2 变体真实 Flowise E2E 重跑；新记录在同一身份下写入（supersede 旧记录语义）。归档仅此一次，重跑完成后如实记录结果。
