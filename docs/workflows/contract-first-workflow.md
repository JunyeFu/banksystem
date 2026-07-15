---
id: DOC-WF-CONTRACT-FIRST
title: 契约优先工作流
document_type: how-to
domain: contract
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# 契约优先工作流

1. 在 `contracts/openapi` 或 JSON Schema 中定义操作、对象、错误和版本。
2. 校验契约语法、引用、operationId 唯一性和示例。
3. 从契约生成 TypeScript 类型/API Client及后端接口骨架或校验器。
4. Mock Server 和 Fixture 只使用契约定义的数据。
5. 后端实现契约并运行请求/响应契约测试。
6. 前端从 Mock 切换真实接口时不得修改页面领域模型。
7. CI 检测实现、契约、生成代码和前端调用的漂移。

金额使用字符串或明确 decimal 语义，时间必须声明格式和时区；写操作必须声明鉴权、幂等、冲突、重试和 Problem Details。
