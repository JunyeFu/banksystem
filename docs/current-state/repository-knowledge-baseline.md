---
id: DOC-STATE-KNOWLEDGE-001
title: Docs RAG Agent 重建基线
document_type: reference
domain: governance
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# Docs、RAG、Agent 重建基线

## 重建前快照

| 范围 | 重建前事实 |
|---|---|
| `docs/` | 108 个文件，约 110 MB；外部原件与正式文档混放 |
| `rag/` | 594 个来源、3740 个分块、74 个索引文件 |
| `agent/` | 42 个文件；任务状态、执行状态和规则存在重复表达 |
| RAG 分类 | `docs/**` 与 `agent/**` 统一归为 `project-document` |
| RAG 排序 | 仅关键词词频，没有权威性、状态、时效与检索域 |

## 本次重建目标

- `docs` 成为人工维护的正式知识源。
- `contracts` 保持机器可执行契约源。
- `knowledge-sources` 隔离外部原件和导入资料。
- `rag/index` 成为可删除、可重建、默认不提交的派生物。
- `agent/backlog.yaml` 成为唯一任务状态源。
- 根与局部 `AGENTS.md` 只保存稳定工程规则，不写易过期完成度。

## 保护说明

重建保留了原前端输入包、确认表、外部资料和历史阶段方案；它们迁入 `docs/archive` 或 `knowledge-sources`，未作为当前实现事实使用。

## 重建后验收

| 指标 | 结果 |
|---|---:|
| 受控来源 | 331 |
| 结构化分块 | 2642 |
| 黄金问题 | 50 |
| Expected Source Recall@8 | 100% |
| Expected Source Top-1 | 92% |
| Mean Reciprocal Rank | 0.955 |
| 敏感/运行态来源污染 | 0 |
| 文档元数据检查 | 49 份通过 |
| 本地链接检查 | 通过 |

`rag/index`、RAG 评测报告、Agent runs、外部二进制原件和本地 deliverables 已配置为 Git 忽略项。任务在 `agent/backlog.yaml` 中保持 `REVIEW`，待人工验收后才能标记 `DONE`。
