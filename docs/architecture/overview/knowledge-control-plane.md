---
id: DOC-ARCH-KNOWLEDGE-001
title: 项目开发知识与执行控制面
document_type: explanation
domain: architecture
status: accepted
authority: normative
version: 1.2
effective_date: 2026-07-20
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

Flowise 平台知识库
              ↓
Flowise Agentflow：个人/办公电脑运行时的语义检索与编排
              ↓ MCP 引用
regression_platform.sqlite：结构化执行知识与回归状态唯一权威
```

## 边界

- `docs` 不用计划文字证明已实现能力，仅作为项目开发和审计知识。
- `rag` 不产生新的项目事实，不直接编辑 `rag/index`，仅供项目开发者和 Codex 检索。
- `agent` 不复制完整架构，只保存任务范围、依赖、验收和证据链接。
- `contracts` 是前后端通信的机器可执行来源；说明性文档不能覆盖 OpenAPI 或 JSON Schema。
- HiAgent 2.5.1 的能力交集和 Flowise 适配规则以 [`hiagent-flowise-capability-boundary-v1.md`](hiagent-flowise-capability-boundary-v1.md) 为当前架构参考；Flowise `Human Input`/`Proceed`/`Reject` 只属于本机适配层，不得作为 HiAgent 原生节点或按钮合同。
- 冲突时按运行证据、测试、契约、源码、当前状态文档、冻结设计、计划、调研、历史资料的顺序核验。
- 交付系统的 Flowise、Harness、Midscene和衡准不得读取、同步或回退到仓库 `docs/`、`rag/` 或 `rag/index/`。
- Flowise 平台知识库保存业务规则、页面语义、术语、风险和解释知识；Flowise 自身 `database.sqlite` 只保存平台配置、流程、会话和知识元数据。Flowise 内部检索实现不作为衡准自研 RAG 组件。
- Harness 的 `regression_platform.sqlite` 保存案例、计划、动作事实、脚本、运行、调度、事故、决定和证据元数据，是回归领域唯一事实源。
- 两个知识控制面只通过 `knowledgeSnapshotId / sourceVersion / contentHash / citationIds` 和 MCP 脱敏摘要交互，禁止正文或状态双写；测试环境按同源知识制品重建 HiAgent Knowledge。仓库 `rag/` 只服务开发，完整产品不包含 `rag/` 目录或自研 RAG 服务。
