---
id: HENGZHUN-I10-AGCLI-TP00-AUTHORITY-REBASELINE-001
title: CLI Agent authority rebaseline
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: Codex
---

# TP00：权威重基线与任务组合

业务目标：把 CLI Agent 大方案变成唯一可执行规划基线，并建立 TP00～TP10 的顺序、状态、边界、验收与证据等级。

- 入口：当前身份 `fbe97820...69630`、`0/18`、运行态不可用、公共回读过期。
- 允许：本任务包、CLI 基线/组合、RF-015、`agent/backlog.yaml`、`v54-implementation-batches.md`。
- 禁止：产品源码、`.data`、运行时、Flowise/MCP/Harness/Worker、账本、发布和身份冻结。
- 常识/易错点：规划 CLOSED 不是实现完成；历史证据不得提升；后续包没有独立 RF 批次前不得 READY。
- 实现模板：`baseline -> machine-readable portfolio -> task packages -> backlog -> order authority -> validators`。
- Done：RF-015 治理校验、时序校验、文档校验和 `git diff --check` 全部退出 0；TP00 进入 REVIEW，其余包保持 BLOCKED。
- 回滚：仅删除新增规划/RF-015 文件并撤销 backlog/v54 精确追加；不得触碰历史批次。

本包只形成 DOC/GOVERNANCE 证据。
