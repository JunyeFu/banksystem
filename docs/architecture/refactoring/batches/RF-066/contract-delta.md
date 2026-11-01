---
id: RF066-CONTRACT
title: RF-066 contract delta
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 contract delta

Existing bank and Quality APIs remain unchanged. Add a versioned Agent OpenAPI contract with generated TypeScript types.

Planned browser resources: conversations list/create/detail, message submit, turn events/read/cancel, model profiles list/save, default-model selection, endpoint check and readiness. Define operationId, request/response schemas, status/error semantics and examples before implementation. API keys are writeOnly; GET returns only keyConfigured and binding metadata.

Add only the MCP/Harness operations needed to persist/retrieve the same conversation metadata. One additive SQLite migration is budgeted. Cancellation is not equivalent to transaction rollback; unknown results remain unknown until authority readback. No stored PASSED flag can create a release GO.

Source review found existing Harness L0-L3 limits (8/16/64/128 KiB) and MCP's 8 KiB default text-result cap. History reads therefore explicitly paginate messages with `before`/`nextMessageCursor`, and events with `after`/`limit`/`hasMoreEvents`. Producers must enforce the existing byte budget as well as count bounds; never cut message text or replay execution to obtain history. RF067 owns the metadata projection and its exact MCP response budget; no global output-limit increase is authorized.

Model-profile version and active-turn binding prevent edits from switching a running task. Endpoint-check errors remain visible and do not invoke other providers. Model names in the Figma are not installed models.

## 前端接线细化形成的待实施加法

RF066-S1的1.0版本与通过证据不回写。代码核对发现bootstrap未含安全阻断原因、turn的COMPLETED不能区分回复与持证测试、图片只有已有CLI导入器而无浏览器导入路由、工件只有安全清单与既有MCP授权而无浏览器代理。RF066-S2任务包定义拟1.1的加法，必须同步源schema、HTTP producer、MCP消费及生成合同后才提供给RF068；本轮未更改OpenAPI或运行接口。


