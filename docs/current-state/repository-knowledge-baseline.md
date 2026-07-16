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

## 清理说明

已清除被替代的历史阶段方案和旧前端确认记录。当前仓库只保留与银行前端修复、Coze/Harness 回归核心、运行证据和现行开发工作流有关的文档；外部资料仅保留仍具开发价值的来源。

2026-07-16：HiAgent 2.5.1 帮助包已从原件提取为 `knowledge-sources/imported/hiagent-2.5.1/` 下的外部参考 Markdown，并以原件 SHA-256 清单、RAG 构建和检索验证确认完整。该资料仅供开发 RAG 检索，不能覆盖 Coze-only 当前架构，也不能成为交付系统运行时知识来源。

## 重建后验收

| 指标 | 结果 |
|---|---:|
| 受控来源 | 333 |
| 结构化分块 | 2666 |
| 黄金问题 | 51 |
| Expected Source Recall@8 | 100% |
| Expected Source Top-1 | 92% |
| Mean Reciprocal Rank | 0.955 |
| 敏感/运行态来源污染 | 0 |
| 文档元数据检查 | 50 份通过 |
| 本地链接检查 | 通过 |

`rag/index`、RAG 评测报告、Agent runs、外部二进制原件和本地 deliverables 已配置为 Git 忽略项。任务在 `agent/backlog.yaml` 中保持 `REVIEW`，待人工验收后才能标记 `DONE`。
