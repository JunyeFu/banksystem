---
id: DOC-ARCH-RF000-CONTRACT
title: RF-000合同差异
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# RF-000合同差异

新增治理合同 `contracts/schemas/governance/refactor-batch-v1.schema.json`。该合同只约束重构批次元数据，不改变银行API、MCP工具、数据库结构、Flowise节点合同或Playwright制品格式。

兼容性：新增且不影响现有运行。撤销时只移除治理引用，不修改业务数据。

