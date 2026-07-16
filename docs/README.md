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

相邻的 [`../documents/`](../documents/) 保存正式项目文书的目录、来源与状态控制；生成的 DOCX/PDF 只进入被 Git 和 RAG 排除的 `deliverables/`。`documents/` 不复制 `docs/` 的架构事实，也不定义实施顺序。

## 事实优先级

1. 当前运行证据、测试、契约和源码。
2. `accepted` 的当前状态、ADR、架构基线和冻结设计。
3. 当前实施计划。
4. 调研与外部参考。

## 实施顺序权威

实施先后只由 [`../agent/plans/active/v54-implementation-batches.md`](../agent/plans/active/v54-implementation-batches.md) 定义，任务状态只由 [`../agent/backlog.yaml`](../agent/backlog.yaml) 定义。架构、设计、验收矩阵、证据、研究、正式文书和历史报告只能补充参数、接口、技术方案、代码设计、验证方法或证据，不得建立第二套排期。

当前交付优先级是 Coze/Harness 自动化回归平台。平台基础可与银行缺陷修复并行；银行页面只按被首批案例实际使用的范围设置案例级门禁，不存在“全部前端完成后平台才能开工”的全局门槛。

文档新增、迁移、RAG 重建和核验规则见 [Docs 与 RAG 协作规范](workflows/rag-governance.md)。
