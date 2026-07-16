---
id: DOC-ARCH-KNOWLEDGE-001
title: 项目开发知识与执行控制面
document_type: explanation
domain: architecture
status: accepted
authority: normative
version: 1.1
effective_date: 2026-07-15
owner: project-owner
---

# 项目开发知识与执行控制面

```text
源码 / 契约 / 测试 / 运行证据
              ↓
docs：人工评审的开发状态、架构、设计与工作流
              ↓
rag：供开发者与 Codex 使用的结构化检索和来源回链
              ↓
agent：引用事实源执行开发任务并提交验证证据

Coze Knowledge Base
              ↓
Coze Agent / Workflow：交付系统运行时的唯一知识检索与编排
```

## 边界

- `docs` 不用计划文字证明已实现能力，仅作为项目开发和审计知识。
- `rag` 不产生新的项目事实，不直接编辑 `rag/index`，仅供项目开发者和 Codex 检索。
- `agent` 不复制完整架构，只保存任务范围、依赖、验收和证据链接。
- `contracts` 是前后端通信的机器可执行来源；说明性文档不能覆盖 OpenAPI 或 JSON Schema。
- 冲突时按运行证据、测试、契约、源码、当前状态文档、冻结设计、计划、调研、历史资料的顺序核验。
- 交付系统的 Coze、Harness、Midscene和衡准不得读取、同步或回退到仓库 `docs/`、`rag/` 或 `rag/index/`。运行时知识只能来自Coze Knowledge Base。
