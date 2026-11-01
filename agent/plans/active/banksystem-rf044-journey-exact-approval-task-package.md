---
id: BANKSYSTEM-RF044-JOURNEY-EXACT-APPROVAL-001
title: RF-044 Journey exact approval task package
document_type: task_package
domain: delivery
status: EVIDENCED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-044：Journey 显式精确批准

## 业务目标

测试人员只能对 Harness 当前冻结的 Journey proposal 明确批准或拒绝；批准后进入作者化处理，不能自动执行浏览器测试。

## 输入与输出

`journey approve|reject <journeyId> --session <sessionId> --revision <n> --proposal <proposalId> --content-hash <sha256> --jsonl`。输出 Harness 最新版本、阶段和状态。

## 实现

- CLI 校验完整精确元组，不支持 `--yes`。
- Controller 先用 `journey_get` 回读当前 proposal，再以 HIGH 风险单次调用 `journey_decision_submit`。
- approve 固定提交 `APPROVE_CASE`，reject 固定提交 `REJECT_CASE`；载荷保持空对象，Harness 校验服务器冻结载荷。
- 批准只允许返回 `PROCESSING_AUTHORING`；拒绝只允许返回 `NEEDS_INPUT`。

## 项目易错点

- 不复用旧通用 `resume` 绕过 Journey 元组。
- 不信任摘要、模型状态或调用方 payload。
- 版本、proposal 或哈希漂移必须在写前失败。
- 不调用 `case_prepare`、`run_submit` 或 Worker。

## 验证

- CONTRACT：命令完整性与拒绝缺失/漂移元组。
- INTEGRATION：假 MCP 证明一次预读、一次 HIGH 写；Fresh Harness 证明批准与拒绝阶段。
- LIVE_E2E：不在本批执行。

## 完成门

批准和拒绝分别只提交一次精确决定；任一漂移零写入；批准后执行调用为零；旧 ReleaseIdentity 标记失效。
