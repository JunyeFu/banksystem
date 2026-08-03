---
id: DOC-INDEX-001
title: 项目文档索引
document_type: reference
domain: governance
status: accepted
authority: normative
version: 1.3
effective_date: 2026-07-21
owner: project-owner
---

# 项目文档索引

`docs/` 是人工维护、可评审的开发知识控制面。代码、契约、测试和运行证据用于证明当前事实；RAG 只负责检索，Agent 只负责任务执行，均不得覆盖正式约束。

| 目录 | 回答的问题 | 权威边界 |
|---|---|---|
| `current-state/` | 当前真实实现了什么 | 必须由代码、测试或运行证据支持 |
| `architecture/` | 为什么采用当前边界 | Accepted ADR、状态机和安全边界 |
| `design/` | 目标系统具体如何设计 | 不等同于已经实现 |
| `workflows/` | 开发、契约、发布如何执行 | 固定质量门和完成定义 |
| `operations/` | 如何安装、运行、恢复 | 运行手册，不保存凭据 |
| `api/` | 前后端如何通信 | 机器契约仍以 `contracts/` 为准 |
| `evidence/` | 如何证明验收结果 | 不替代实时运行核验 |
| `research/` | 参考过哪些资料 | 低于正式架构和冻结设计 |
| `reference/` | 经整理的外部技术参考 | 不能证明本项目已实现 |
| `control/` | 多轮对话如何保持决策、技术约束和权威链一致 | 不建立第二套实施顺序或任务状态 |

相邻的 [`../documents/`](../documents/) 保存正式项目文书的目录、来源与状态控制；生成的 DOCX/PDF 只进入被 Git 和 RAG 排除的 `deliverables/`。`documents/` 不复制 `docs/` 的架构事实，也不定义实施顺序。

## 事实优先级

1. 当前运行证据、测试、契约和源码。
2. `accepted` 的当前状态、ADR、架构基线和冻结设计。
3. 当前实施计划。
4. 调研与外部参考。

## 实施顺序权威

实施先后只由 [`../agent/plans/active/v54-implementation-batches.md`](../agent/plans/active/v54-implementation-batches.md) 定义，任务状态只由 [`../agent/backlog.yaml`](../agent/backlog.yaml) 定义。架构、设计、验收矩阵、证据、研究、正式文书和历史报告只能补充参数、接口、技术方案、代码设计、验证方法或证据，不得建立第二套排期。

I0—I7 的 Coze/Harness 本机交付、I8 确定性引擎和 I9 Flowise 基线均已冻结为历史；当前唯一实施阶段是 I10 Flowise 正式便携版。I10 统一自然语言、案例文件和视频入口，使用本机 DPAPI `credentialRef`、真实 Midscene 作者化、纯 Playwright 四次验证和完整源码交付。MCP 是 Flowise 唯一平台外工具通道；仓库 `rag/` 只用于开发，完整产品不包含 RAG 结构。HiAgent 迁移时，Flowise `Human Input`/`Proceed`/`Reject` 只作为本机适配层，跨平台合同改用信息收集、消息和选择器/条件；详见 [HiAgent/Flowise 能力边界基线](architecture/overview/hiagent-flowise-capability-boundary-v1.md)。详细约束见 [I10 正式便携版规格](design/regression-platform/i10-flowise-formal-portable-spec-v1.md)。

多轮协作先读 [衡准多轮协作简明控制卡](control/collaboration-brief.md)，需要核对完整技术约束、审计问题、追踪编号和更新事务时读 [衡准技术控制登记册与多轮变更协议](control/technical-control-register.md)。

文档新增、迁移、RAG 重建和核验规则见 [Docs 与 RAG 协作规范](workflows/rag-governance.md)。
