---
id: DOC-ARCH-RF002-TARGET
title: RF-002目标设计（占位——范围待细化）
document_type: design
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-002目标设计（占位）

## 状态

RF-002（状态所有权重构）尚未细化。本文件占位；以下为来自RF-001-B1考古与B2决策的**候选线索**（不构成授权）：

1. **条件写工具的状态所有权**（RF001-F05）：`candidate_get`（可编译/轮询/合并验证门槛）、`schedule_get`（action=DISABLE写路径）、`result_inbox_list`（确认已读副作用）——条件副作用已显式声明（B2），"get/list"命名与实际状态推进的所有权归属待定。
2. **读取后写入复合工具的版本绑定**：`candidate_decide`/`schedule_disable`/`decision_submit` 的预读→乐观并发写（expectedVersion绑定）——绑定状态由MCP持有还是收敛到Harness待定。
3. **轮询与状态投影所有权**：`candidate_get`/`task_get` 将verification状态投影为任务状态、轮询循环——投影所有权（MCP vs Harness）待定。
4. **Journey状态机与紧凑投影边界**（B2决策3：Journey根别名只由MCP紧凑投影生成）：`compactJourneyForFlowise` 与 Harness journey 状态机的职责边界待定。

## 细化要求（RC-D0）

target-design细化时必须定义：单一变化轴、模块所有者、输入/输出/状态归属、允许/禁止依赖、同步/异步语义、幂等/审计、失败关闭与降级边界；禁止"统一处理""智能判断"等不可验证表达。细化后经用户批准，再进入切片链与任务包。
