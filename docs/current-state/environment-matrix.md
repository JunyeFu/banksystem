---
id: DOC-STATE-ENVIRONMENT-MATRIX
title: 当前环境矩阵
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前环境矩阵

| 环境 | 目标 | 事实状态 |
|---|---|---|
| 个人电脑 | Flowise正式版本机开发和验证 | 当前主要实现环境；运行状态需按次采集 |
| 办公电脑 | 权限/工具链兼容性验证 | 尚不得由个人电脑证据替代 |
| 测试服务器 | HiAgent迁移和测试环境运行 | 后续阶段；本机Flowise成功不等于HiAgent成功 |

环境配置只登记变量名，不登记值。银行环境变量以 `.env.example` 为登记入口；衡准模型变量统一使用 `CONTROL_*` 与 `VISION_*`。密钥、Token、密码、Cookie和Storage State不得进入本文档、Git、日志或证据。

