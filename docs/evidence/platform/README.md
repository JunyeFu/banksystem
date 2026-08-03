---
id: DOC-EVIDENCE-PLATFORM-INDEX
title: 衡准平台验收证据辅助索引
document_type: reference
domain: platform
status: accepted
authority: supporting
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准平台验收证据辅助索引

本文只提供平台证据文件的导航和状态摘要，不拥有实施顺序、任务状态或架构权威。

| 范围 | 当前状态 | 证据边界 |
|---|---|---|
| I1—I7 | `verified / historical-baseline` | Coze/Harness 历史本机闭环 |
| I8 阶段2—7 | `verified / local-engine` | 本机 Harness、MCP、Worker、固定 Chromium 和 SQLite 引擎；不证明正式 Flowise 平台 |
| I9 P1—P6 | `verified / local-flowise-product` | Windows运行底座、公开资源导入、MiMo与14工具、正式Agentflow发布/恢复及真实正向对话已通过 |
| I9 P7—P9 | `open` | 反向恢复、跨电脑便携候选和最终可压缩提交文件夹尚未完成；不证明HiAgent验收 |

证据文件状态必须与 `docs/current-state/capability-matrix.md` 和运行验证结果同步；静态制品、隔离探针和设计文档不能替代平台运行证据。
