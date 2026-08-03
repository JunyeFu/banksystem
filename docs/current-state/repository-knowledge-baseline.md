---
id: DOC-STATE-KNOWLEDGE-001
title: Docs RAG Agent 重建基线
document_type: reference
domain: governance
status: verified
authority: evidence
version: 1.2
effective_date: 2026-07-21
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

2026-07-16：HiAgent 2.5.1 帮助包已从原件提取为 `knowledge-sources/imported/hiagent-2.5.1/` 下的外部参考 Markdown，并以原件 SHA-256 清单、RAG 构建和检索验证确认完整。该资料仅供开发 RAG 检索，不能成为交付系统运行时知识来源。

2026-07-21：I0—I7 的 Coze 架构冻结为历史事实；I8 七阶段确定性本机引擎已关闭，当前目标改为 I9 Flowise Agentflow + MCP + 双 SQLite + P9 最终可压缩提交文件夹。Flowise 语义知识库与 Harness 结构化执行知识库只交换知识快照引用，仓库 `docs/rag` 仍不进入产品运行时。2026-07-27新增 HiAgent/Flowise 能力边界基线：Flowise `Human Input`/`Proceed`/`Reject` 仅属本机适配层，HiAgent迁移使用信息收集、消息和选择器/条件；HiAgent帮助资料已归档至 `docs/reference/hiagent-2.5.1-help/` 并提供 `readable/` UTF-8镜像。

2026-07-21：重新扫描得到 `docs/` 82 份带完整元数据文档：`accepted=49`、`verified=28`、`superseded=4`、`draft=1`；权威分布为 `normative=38`、`evidence=28`、`supporting=11`、`historical=4`、`proposal=1`。这份扫描只更新辅助文档索引状态，不改变权威链或任务状态。

2026-07-21：开发用 RAG 重建仍保持中止，当前 `rag/index/manifest.json` 未生成，开发索引状态为 `NOT_BUILT`。下表保留最近一次已完成验收的历史指标，不代表当前索引可用；需要开发检索时可单独重建。该状态不影响衡准系统运行、验收或便携交付，因为完整产品不包含 RAG 目录、向量索引、嵌入模型或自建检索链路。

## 最近一次已完成的开发索引验收（历史记录）

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

`rag/index`、RAG 评测报告、Agent runs、外部二进制原件和本地 deliverables 已配置为 Git 忽略项。开发索引的生成与否不得成为衡准产品启动、运行或交付的前置条件。任务在 `agent/backlog.yaml` 中保持 `REVIEW`，待人工验收后才能标记 `DONE`。
