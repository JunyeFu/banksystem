---
id: DOC-INDEX-001
title: 项目文档索引
document_type: reference
domain: governance
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 项目文档索引

`docs/` 是人工维护、可评审的项目知识事实源。代码、契约、测试和运行证据用于证明当前事实；RAG 只负责检索，Agent 只负责任务执行，均不得覆盖本目录中的正式约束。

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
| `archive/` | 历史方案与被替代决策 | 默认不参与当前状态检索 |

## 事实优先级

1. 当前运行证据、测试、契约和源码。
2. `accepted` 的当前状态、ADR、架构基线和冻结设计。
3. 当前实施计划。
4. 调研与外部参考。
5. `historical`、`deprecated`、`superseded` 文档。

文档新增、迁移、RAG 重建和核验规则见 [Docs 与 RAG 协作规范](workflows/rag-governance.md)。
