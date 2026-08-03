---
id: DOC-STATE-SYSTEM-OVERVIEW
title: 当前系统总览
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前系统总览

| 系统 | 当前代码位置 | 事实状态 | 来源 |
|---|---|---|---|
| 复兴银行Channel | `services/bank-channel-service` | CONFIRMED：Java模块化单体 | ADR-002与源码包目录 |
| 客户门户 | `apps/customer-portal` | CONFIRMED：React/Vite独立应用 | `package.json` |
| 运营控制台 | `apps/operations-console` | CONFIRMED：React/Vite独立应用 | `package.json` |
| 衡准观测前端 | `apps/quality-case-portal` | CONFIRMED：React/Vite独立应用 | `package.json` |
| 衡准回归系统 | `platform/hengzhun-regression-system` | CONFIRMED：Flowise、Harness、MCP、Worker多运行角色 | 目录与构建脚本 |
| 银行核心 | 外部Fineract容器/网络 | CONFIRMED：账务唯一事实源 | `AGENTS.md`与Compose合同 |

实现完成度不由本文件推断，必须回到当前能力矩阵和LIVE_E2E证据。

