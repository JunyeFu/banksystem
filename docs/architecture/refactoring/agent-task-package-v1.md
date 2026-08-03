---
id: DOC-ARCH-REFACTOR-AGENT-TASK-V1
title: 重构Agent任务包规范
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 重构Agent任务包规范

每次Agent修改必须从获准批次生成一个任务包，至少包含单一业务目标、真实入口、允许/禁止路径、允许模块、必须保持的URL/字段/错误码/事务语义、修改预算、具体测试命令、证据位置和回滚点。

执行规则：

- 任务包中的零值表示明确禁止，不得作为“待填写”。
- Agent发现白名单外必要修改时停止并提出拆批，不自行扩权。
- 不得同时引入大型功能、依赖升级、目录重排和业务迁移。
- 同类失败连续三次后停止重试，记录合同断点和最小复现。
- 完成声明必须引用本次命令、退出码、ReleaseIdentity和证据增量。
- **逐级向上同步（RC-D1）**：任务包必须包含“向上同步”项——执行中确定的任何新细节（字段/别名事实、决策结果、预算消耗、合同修正、审计发现、风险变化）必须立即逐级回写：任务包→切片（`slices/`）→批次（`batch.yaml`）→实施顺序与目标设计/合同文档，并在 `decision-log.md` 登记；同步未完成不得声明任务完成，也不得进入下一切片。

