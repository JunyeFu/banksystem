---
id: DOC-STATE-MODULE-INVENTORY
title: 当前模块清单
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.1
effective_date: 2026-08-01
owner: project-owner
---

# 当前模块清单

代码考古事实详见 [`code-archaeology-v1.md`](code-archaeology-v1.md)。

权威机器可读清单为 [`../architecture/refactoring/module-boundaries-v1.yaml`](../architecture/refactoring/module-boundaries-v1.yaml)。

- 银行Channel已观察到 identity、customerprofile、accounts、beneficiaries、payments、risk、notifications、documents、reconciliation、audit、operations和内部test-support模块；每个模块的HTTP公开面和局部表归属已登记。
- 衡准已观察到Flowise、Harness、MCP、Worker、contracts和tests运行角色。
- Harness与Worker当前仍以阶段/脚本文件为主，标记 `LEGACY_UNENCAPSULATED`；这表示边界尚未完成，不表示不可运行。
- 前端包括customer-portal、operations-console和quality-case-portal，并复用packages下的API、类型、UI和安全包；共享包已作为独立部署登记。

运行时版本、表级写入方和跨模块内部导入仍需要各RF批次逐项补证；未知项不得写成已完成。
