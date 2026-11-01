---
id: RF066-VERIFY
title: RF-066 verification plan
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 verification plan

## Evidence levels

STATIC: lint/typecheck/build and governance/docs. CONTRACT: HTTP/MCP DTO, secret omission, same-origin rejection and model binding. INTEGRATION: isolated Harness SQLite and existing production-service adapters; deterministic models only inside tests. LIVE_E2E: current-identity real BYOK conversation and browser read-only bank goal, only after all relevant gates. These levels are not interchangeable.

Planned commands (not implemented or passed yet):

- `powershell -NoProfile -File scripts/test/verify-agent-workbench.ps1 -Scope Contract`
- `powershell -NoProfile -File scripts/test/verify-agent-workbench.ps1 -Scope Integration`
- `npm.cmd --prefix apps/quality-case-portal run lint`
- `npm.cmd --prefix apps/quality-case-portal run typecheck`
- `npm.cmd --prefix apps/quality-case-portal run test`
- `npm.cmd --prefix apps/quality-case-portal run build:agent`
- `powershell -NoProfile -File scripts/test/verify-agent-workbench.ps1 -Scope Browser`
- `powershell -NoProfile -File scripts/test/verify-agent-workbench.ps1 -Scope LiveReadOnly`

Browser checks cover creation, truthful progress/error, refresh and process restart history, manual next-task model selection, masked configuration, secret-free responses, and Quality remaining read-only. Compare accepted/design and rendered screenshots at 1440x1000 plus a mobile viewport, including typography, sidebar, composer, dropdown, configuration, icons and palette.

## 当前命令边界与细化

上列命令是历史规划，Windows本机实际使用`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1`，仅改变该进程策略。当前只有Contract scope实现；Integration、Browser、LiveReadOnly均仍为NOT_IMPLEMENTED/3。RF067补隔离持久化/MCP集成，RF066-S2补生产组合/模型/附件/证据集成，RF068补浏览器-Case Foundation/History/Conversation/Models/All。新增npm生成/检查/build:agent脚本也尚未实现；命令出现在任务包不构成通过证据。


