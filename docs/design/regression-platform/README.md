---
id: DOC-DESIGN-REGRESSION-PLATFORM-INDEX
title: 衡准回归平台设计辅助文档索引
document_type: reference
domain: regression-platform
status: accepted
authority: supporting
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准回归平台设计辅助文档索引

本文只索引回归平台的设计辅助规格，不定义项目实施顺序或任务状态。实施顺序只看 [`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md)，任务状态只看 [`agent/backlog.yaml`](../../../agent/backlog.yaml)。

| 文档 | 当前状态 | 用途 |
|---|---|---|
| [`i8-deterministic-authoring-spec-v1.md`](i8-deterministic-authoring-spec-v1.md) | `accepted / completed-baseline` | I8 已完成确定性本机引擎的 Schema、状态机、DSL、Builder、Worker、MCP 和验证约束 |
| [`i9-flowise-productization-spec-v1.md`](i9-flowise-productization-spec-v1.md) | `frozen-history` | I9 Flowise 已验证历史基线 |
| [`i10-flowise-formal-portable-spec-v1.md`](i10-flowise-formal-portable-spec-v1.md) | `accepted / completed-local-boundary` | I10统一输入、双模型、凭据、四次验证及现有桌面目录VERIFY清单与校验和收口约束 |
| [`../../architecture/overview/hiagent-flowise-capability-boundary-v1.md`](../../architecture/overview/hiagent-flowise-capability-boundary-v1.md) | `accepted / normative` | HiAgent 2.5.1 与 Flowise 节点、交互、Skill、MCP 和网络边界；Flowise Human Input/Proceed/Reject 只属本机适配层 |

当前扫描结论：I8/I9 只作为已完成历史基线；I10 规格是当前实施辅助规格。代码或Agentflow制品存在不等于双模型真实调用、Flowise公开API发布、三入口E2E或平台便携合同已经通过。I10不建立第二台电脑专项验收门槛。
