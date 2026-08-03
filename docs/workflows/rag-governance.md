---
id: DOC-WF-RAG-GOVERNANCE
title: 开发 Docs 与 RAG 协作规范
document_type: how-to
domain: rag
status: accepted
authority: normative
version: 2.4
effective_date: 2026-07-21
owner: project-owner
---

# 开发 Docs 与 RAG 协作规范

> 本文只约束项目开发、审计与Codex维护使用的仓库知识。它不是交付系统的运行时知识方案；`rag/` 永远不进入衡准完整产品。I9 运行时业务知识来自 Flowise 平台知识库，结构化执行知识和回归状态来自 Harness `regression_platform.sqlite`；I8 只保留为已完成本机引擎基线。

## 角色分工

HiAgent 2.5.1 帮助资料的原件与 UTF-8 阅读镜像位于 `docs/reference/hiagent-2.5.1-help/`，只作为外部参考；其能力结论已固化到 [`docs/architecture/overview/hiagent-flowise-capability-boundary-v1.md`](../architecture/overview/hiagent-flowise-capability-boundary-v1.md)。

- `docs/`：人工维护、评审和版本控制的项目开发状态、架构、设计、工作流、运行手册与证据。
- `documents/`：正式项目文书的目录、状态与可审阅文本源；生成 DOCX/PDF 只进入 `deliverables/`，不得反向定义架构、当前能力或实施顺序。
- `contracts/`：OpenAPI、JSON Schema、Fixture 和 Catalog 等机器可执行契约。
- 代码、测试、迁移和实时运行证据：判断当前实现的最高优先级依据。
- `knowledge-sources/`：第三方原件与导入文本，不证明项目当前状态。
- `rag/config/`：项目开发使用的来源策略、权威权重、检索域与排除规则。
- `rag/eval/`：黄金问题、期望来源和检索验收报告。
- `rag/index/`：机器生成、可删除重建、默认不提交的派生层。

## 固定流程

```text
编辑并评审 docs / documents / contracts / code / tests
  → python scripts/docs/validate_docs.py
  → python scripts/rag/build_rag.py
  → python scripts/rag/validate_rag.py
  → python scripts/rag/query_rag.py --profile current "问题"
  → 回链源文件、契约、测试或运行证据核验
```

## 检索域

- `current`：当前源码、契约、测试、运行证据和能力矩阵。
- `normative`：Accepted ADR、架构基线、冻结设计和固定工作流。
- `planning`：Backlog、主动实施计划和拟议设计。
- `reference`：调研、外部资料、历史与被替代方案。

默认仅检索 `current + normative`。询问历史、第三方产品或未来计划时才显式启用相应域。

## 冲突处理

运行证据 > 测试 > 契约 > 当前源码 > 当前状态文档 > Accepted 设计 > 计划 > 调研 > 历史资料。

RAG 的分数只决定项目开发时“先看什么”，不决定“谁是真相”。当前状态结论必须回到代码、测试、契约或运行态核验。

## 禁止事项

- 不直接修改 `rag/index`。
- 不索引 `.env`、密钥、凭据、Cookie、Token、Storage State、真实 PII、数据库卷、日志、Trace、Worker 产物或本地交付件。
- 不用历史方案证明当前实现。
- 不把外部资料中的能力写成本项目能力。
- 不在索引中保存原始 DOCX/PDF/ZIP 二进制内容。
- 不把仓库 `docs/`、`rag/` 或 `rag/index/` 接入交付系统的 Flowise、Harness、Midscene或衡准运行时。
- Flowise 运行时知识必须通过平台公开知识入口导入并记录来源、版本、Hash 和引用；不得把仓库开发 RAG 当作运行时回退，也不得在产品目录新建 RAG、Embedding、Vector Store 或 Retriever 子系统。
- `regression_platform.sqlite` 只保存结构化执行知识、状态和 Flowise 知识快照引用，不复制 Flowise 知识正文、向量或完整对话。
- 不从 `documents/`、调研或历史报告建立第二套开发顺序；项目级先后关系只读取 `agent/plans/active/v54-implementation-batches.md`。
