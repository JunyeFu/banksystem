---
id: DOC-WF-RAG-GOVERNANCE
title: Docs 与 RAG 协作规范
document_type: how-to
domain: rag
status: accepted
authority: normative
version: 2.0
effective_date: 2026-07-15
owner: project-owner
---

# Docs 与 RAG 协作规范

## 角色分工

- `docs/`：人工维护、评审和版本控制的项目状态、架构、设计、工作流、运行手册与证据。
- `contracts/`：OpenAPI、JSON Schema、Fixture 和 Catalog 等机器可执行契约。
- 代码、测试、迁移和实时运行证据：判断当前实现的最高优先级依据。
- `knowledge-sources/`：第三方原件与导入文本，不证明项目当前状态。
- `rag/config/`：来源策略、权威权重、检索域与排除规则。
- `rag/eval/`：黄金问题、期望来源和检索验收报告。
- `rag/index/`：机器生成、可删除重建、默认不提交的派生层。

## 固定流程

```text
编辑并评审 docs / contracts / code / tests
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

RAG 的分数只决定“先看什么”，不决定“谁是真相”。当前状态结论必须回到代码、测试、契约或运行态核验。

## 禁止事项

- 不直接修改 `rag/index`。
- 不索引 `.env`、密钥、凭据、Cookie、Token、Storage State、真实 PII、数据库卷、日志、Trace、Worker 产物或本地交付件。
- 不用历史方案证明当前实现。
- 不把外部资料中的能力写成本项目能力。
- 不在索引中保存原始 DOCX/PDF/ZIP 二进制内容。
