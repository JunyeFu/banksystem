---
id: DOC-ARCH-REFACTOR-METRICS-V1
title: 重构量化指标目录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 重构量化指标目录

| 指标 | 计算口径 | 最终目标 |
|---|---|---:|
| 核心流程E2E覆盖率 | 有当前LIVE_E2E证据的登记核心流程/登记核心流程总数 | 100% |
| 模块循环依赖 | 依赖图中的强连通环数量 | 0 |
| 跨模块内部导入 | 未经公开出口的导入数量 | 0 |
| Controller直接数据库访问 | Interface层直接调用数据库/ORM的命中数 | 0 |
| 未登记环境变量 | 代码读取但环境清单未登记的变量数 | 0 |
| 无归属数据库表 | 表所有权清单中owner为空的表数 | 0 |
| 重复核心规则 | 已确认语义重复但未指定权威实现的规则数 | 0 |
| 人工构建步骤 | 无脚本且依赖个人记忆的必需步骤数 | 0 |
| 核心API合同覆盖率 | 有生产者和消费者合同验证的核心API/核心API总数 | 100% |
| 独立回滚率 | 已演练独立回滚的获准批次/已切流批次 | 100% |

每次采集必须记录分母清单、扫描范围、命令、工具版本、时间、退出码和证据路径。目标值不能代替当前值；没有采集命令的指标标记 `NOT_MEASURED`，不得填0。

