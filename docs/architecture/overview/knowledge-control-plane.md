---
id: DOC-ARCH-KNOWLEDGE-001
title: 项目知识与执行控制面
document_type: explanation
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 项目知识与执行控制面

```text
源码 / 契约 / 测试 / 运行证据
              ↓
docs：人工评审的状态、架构、设计与工作流
              ↓
rag：结构化分块、元数据、检索和来源回链
              ↓
agent：引用事实源执行任务并提交验证证据
```

## 边界

- `docs` 不用计划文字证明已实现能力。
- `rag` 不产生新的项目事实，不直接编辑 `rag/index`。
- `agent` 不复制完整架构，只保存任务范围、依赖、验收和证据链接。
- `contracts` 是前后端通信的机器可执行来源；说明性文档不能覆盖 OpenAPI 或 JSON Schema。
- 冲突时按运行证据、测试、契约、源码、当前状态文档、冻结设计、计划、调研、历史资料的顺序核验。
