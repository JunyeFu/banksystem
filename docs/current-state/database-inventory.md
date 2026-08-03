---
id: DOC-STATE-DATABASE-INVENTORY
title: 当前数据库清单
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前数据库清单

| 数据库 | 权威职责 | 迁移机制 | 当前事实 |
|---|---|---|---|
| Fineract数据库 | 账户、余额和账务事实 | Fineract拥有 | 禁止Channel或衡准直接写 |
| Channel PostgreSQL | 渠道投影、映射和流程兼容数据 | Liquibase | master changelog存在；实际运行版本需现场查询 |
| Harness SQLite | 衡准案例、Journey、任务、调度、证据与修复状态 | 顺序SQL迁移 | 源码迁移001至036存在；实际数据库版本需现场查询 |
| Flowise SQLite | Flowise配置和运行元数据 | Flowise拥有 | 不作为衡准业务权威库 |

表级所有权当前为 `NOT_MEASURED`。任何数据重构批次开始前必须生成表、唯一约束、事务、写入方和跨模块读取登记。

