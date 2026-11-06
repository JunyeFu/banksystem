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

2026-11-06当前本地草稿：七类文书已按用户授权使用独立只读Word导出、捆绑PDF工具及35页逐页检查，7/7通过，交付在deliverables/normalization-20261106/verified-local。详见[实际回执](../docs/design/product-normalization/formal-documents-20261106.md)与catalog的rendering字段。它们是现状草稿，不是用户/机构签收，也不代表产品GO；下方较早缺渲染器/未验页描述只保留过程。

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

## 当前规范源稿

2026-11-06七类均有独立Markdown源稿，由catalog的normalizationSourceSet逐项映射；DRAFT_LOCAL只表示本地源稿，不表示Word/PDF已渲染、产品通过或接收人签署。立项与需求复用已确认N01—N12，验收与交接分别成稿，不复制同一份记录充作两类文书。

既有build_bank_project_document.py生成的是带待填写提示的空白模板，不能用其输出冒充本轮源稿导出。新增[源稿导出入口](../scripts/documents/export_normalization.py)直接生成当前正文，原模板不改；七份未验页草稿已在ignored deliverables/normalization-20261106创建，不是合格交付。维护者用workspace依赖查询返回的捆绑Python设置documentPython后执行，例如：

```powershell
& $documentPython scripts/documents/export_normalization.py --source docs/design/product-normalization/handover.md --output deliverables/normalization-current/衡准自动化回归测试平台交付运维交接_DRAFT.docx
```

其它类型按catalog选择源稿和输出名。入口限定本规范源目录和deliverables，已有输出明确拒绝覆盖；源码正文、比较表、引用和实际未完成条件保留，不自动填签名或发布结果。更新后使用新的审阅输出目录，原生成件是否保留按任务证据需要确定。

当前文档技能要求的捆绑LibreOffice在Windows工具包中缺失，故verifiedDocuments仍为0、未交付DOCX；未改用桌面Office绕过验页。[本轮任务与实际工具检查](../docs/design/product-normalization/formal-documents-20261106.md)保留此缺项，恢复受支持生成能力后才继续逐页复核。
