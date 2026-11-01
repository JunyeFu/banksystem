---
id: BANKSYSTEM-OSS-A04-QUALITY-READ-MODEL-001
title: Read-only Quality Portal task package
document_type: task_package
domain: delivery
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# TP-A04: 只读质量门户与证据投影

## 业务目标

质量负责人通过浏览器查看 Harness 中的用例、基线、运行、计划、事件、知识快照与发布状态；页面只能观察，不能创建、批准、执行、恢复或发布。

## 输入与输出

输入是 Harness SQLite 与现有证据记录。输出是 `http://127.0.0.1:18788/quality/` 九页面和 `/api/quality/v1/**` 脱敏 GET 投影。浏览器不持有 Harness service token。

## 实现

- RF-037：实现 SQLite 只读投影、OpenAPI 和生产者/消费者契约。
- RF-038：由 Harness 同端口托管前端，完成九页面和 VQ-07 视觉验收，删除伪写操作。
- RF-039：将 Journey、Run、Correlation 与执行时 ReleaseIdentity 从正式记录投影到运行列表，不为历史运行猜测身份。

## 项目易错点

- Harness SQLite 是测试平台唯一状态源，前端不得保留 Mock。
- 稳定性证书不等于 ReleaseIdentity，缺少正式发布证据时门禁必须保持 `PENDING`。
- Quality Portal 只读不等于 Harness 内部写接口公开；原有写接口继续鉴权。
- Flowise 历史表结构不能成为运行依赖或回退路径。

## 验证

- STATIC：Harness TypeScript 与 Quality Portal production build。
- CONTRACT：Fresh SQLite 投影、无 token GET、写请求 405、OpenAPI 生成类型。
- INTEGRATION：Harness 18788 同源托管、SPA 直接路由、九视图、浏览器控制台零错误。
- LIVE_E2E：留待当前新 ReleaseIdentity 的正式清单，不由 RF-037/RF-038 冒充。

## 完成门

九页面读取真实 Harness 状态、可见写操作为零、运行身份持久绑定且可投影。RF-037 至 RF-039 已关闭工程实现；真实模型与真实银行执行的同身份证明归入 A05/A06，不由本任务包冒充 LIVE 完成。
