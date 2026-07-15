---
id: DOC-WF-RELEASE-GATES
title: 发布验证门禁
document_type: reference
domain: workflow
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 发布验证门禁

| 顺序 | 门禁 | 目标 |
|---:|---|---|
| 1 | 格式、静态检查、编译 | 最快发现语法与类型问题 |
| 2 | 单元测试 | 验证领域规则和纯函数 |
| 3 | 契约测试 | 阻止前后端和 Mock 漂移 |
| 4 | 集成测试 | 验证数据库、队列、身份和服务边界 |
| 5 | Playwright 业务流 | 验证真实用户闭环 |
| 6 | 视觉回归与可访问性 | 验证呈现、键盘和稳定标识 |
| 7 | 安全、金额、审计、对账 | 验证银行级约束 |
| 8 | Docker Smoke、备份恢复 | 验证本机可重复交付 |

任何门禁失败都不得以“演示环境”为由跳过；无法运行时必须记录原因、影响和补验条件。
