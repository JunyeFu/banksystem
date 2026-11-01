---
id: DOC-ARCH-REFACTOR-AGENT-TASK-V1
title: 重构Agent任务包规范
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.1
effective_date: 2026-10-24
owner: project-owner
---

# 重构Agent任务包规范

每次Agent修改必须从获准批次生成一个任务包，至少包含单一业务目标、真实入口、允许/禁止路径、允许模块、必须保持的URL/字段/错误码/事务语义、修改预算、具体测试命令、证据位置和回滚点。

执行规则：

- 任务包中的零值表示明确禁止，不得作为“待填写”。
- Agent发现已授权业务目标内的必要相邻修改时，先补齐路径/范围记录再实施；超出用户明确边界才请求决定，不因漏写路径反复停止。
- 不得同时引入大型功能、依赖升级、目录重排和业务迁移。
- 正式LIVE沿用其首次确定性失败停止条件，不自动重试；已授权的源码诊断、修复及必要测试可继续，修复后从新候选验收起点执行。
- 完成声明必须引用本次命令、退出码、ReleaseIdentity和证据增量。
- **必要同步（RC-D1）**：验收前同步实质目标、合同、范围及完成状态的变化；无变化的层级不重复改写，普通实现细节集中写入任务证据。

