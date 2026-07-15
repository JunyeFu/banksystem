---
id: DOC-WF-DORDOD
title: Definition of Ready 与 Definition of Done
document_type: reference
domain: workflow
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# Definition of Ready 与 Definition of Done

## Ready

- 目标、非目标、角色、入口、主流程、异常流程和验收结果明确。
- 页面状态、领域状态机、权限和审计要求明确。
- OpenAPI/Schema、错误码、示例和 Mock 已通过校验。
- 依赖、允许修改路径、回滚方式和测试命令已登记。
- 不需要读取或提交任何密钥、`.env` 或运行态数据。

## Done

- 前后端、迁移、配置、文档和契约保持一致。
- 页面覆盖适用的加载、空、错误、无权限、提交和业务结果状态。
- 单元、契约、集成、Playwright、视觉和安全检查通过。
- Docker 本机可以从受支持基线启动、重置并复现实验结果。
- 证据包含命令、结果、时间、版本、提交和残余风险。
- 任务进入 `REVIEW` 后经人工确认才能标记 `DONE`。
