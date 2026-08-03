---
id: DOC-ARCH-REFACTOR-DEPS-V1
title: 重构模块依赖规则
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 重构模块依赖规则

## 强制规则

1. 模块不得直接访问其他模块拥有的数据表。
2. 模块之间只通过登记的应用接口、事件、只读投影或查询接口通信。
3. Domain不得依赖框架、数据库、HTTP、UI、文件系统或第三方SDK。
4. Interface/Controller不得直接操作数据库。
5. UI不得拼接数据库字段或调用Fineract、Harness SQLite和Flowise SQLite。
6. Repository不得包含业务决策。
7. Shared不得保存业务规则、状态机或模块私有DTO。
8. 禁止跨模块导入内部文件；只允许登记的公开出口。
9. 禁止循环依赖。
10. 禁止新增未登记的全局状态、环境变量、端口或后台进程。
11. Flowise只通过受控MCP调用系统外工具。
12. Midscene只提供定位证据；Playwright拥有浏览器动作和断言执行权。

## 公开出口

每个模块必须在 [`module-boundaries-v1.yaml`](module-boundaries-v1.yaml) 登记根目录、公开出口、数据所有权和允许依赖。没有公开出口的现有模块标记为 `LEGACY_UNENCAPSULATED`，只能在专门批次中收口，不能假装已满足。

## 机器校验

`python scripts/architecture/validate_refactoring.py`至少检查模块ID、根目录、批次依赖、写入白名单、禁止路径、修改预算和测试命令。具体语言的导入扫描在相应批次中追加，不得用尚未覆盖的扫描器宣称全仓库依赖为零。

