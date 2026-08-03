---
id: DOC-FORMAL-DOCUMENT-INDEX
title: 正式项目文书目录与生成边界
document_type: reference
domain: formal-documents
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-16
owner: 傅钧烨
---

# 正式项目文书目录与生成边界

`documents/` 只管理正式文书的类型、状态、文本来源、生成入口与验收边界。它不复制 `docs/` 的架构事实，不保存运行态数据，也不建立开发顺序。

## 权威关系

- 项目开发顺序唯一来源：[`../agent/plans/active/v54-implementation-batches.md`](../agent/plans/active/v54-implementation-batches.md)。
- 任务状态唯一来源：[`../agent/backlog.yaml`](../agent/backlog.yaml)。
- 当前事实：代码、契约、测试、运行证据和 [`../docs/current-state/`](../docs/current-state/)。
- 架构与技术设计：[`../docs/architecture/`](../docs/architecture/) 与 [`../docs/design/`](../docs/design/)。
- 文书格式与行业参考：[`../docs/research/bank-project-document-chain/`](../docs/research/bank-project-document-chain/)。
- 文书生成工具：[`../scripts/documents/`](../scripts/documents/)。
- DOCX/PDF 生成件：`../deliverables/`，本地可重建，Git 与开发 RAG 均排除。

## 七类文书

具体状态、输入和输出模式由 [`catalog.yaml`](catalog.yaml) 管理。文书只能引用已核验事实；规划内容必须明确标注为目标或待验证，不能把设计写成已实现。

任何新增文书必须先更新 `catalog.yaml`，再引用受控来源，最后生成 DOCX/PDF 并进行内容、链接、分页和视觉检查。
