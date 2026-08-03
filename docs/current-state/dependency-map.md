---
id: DOC-STATE-DEPENDENCY-MAP
title: 当前依赖关系图
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前依赖关系图

```text
浏览器 → Gateway → Bank Channel Service → Fineract Adapter/API → Fineract
浏览器 → Keycloak → Bank Channel Service身份映射
Flowise → MCP → Harness → SQLite
Harness → Worker → Midscene定位 / Playwright执行 → 被测网站
Worker → Artifact/结果 → Harness → MCP → Flowise
```

以上是合同级依赖。源码级循环依赖、跨模块内部导入和直接数据库访问尚未完成全量机器扫描，当前状态为 `NOT_MEASURED`，不得写成0。约束规则见 [`../architecture/refactoring/dependency-rules-v1.md`](../architecture/refactoring/dependency-rules-v1.md)。

