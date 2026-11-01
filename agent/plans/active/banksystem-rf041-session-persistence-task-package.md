---
id: BANKSYSTEM-RF041-SESSION-PERSISTENCE-001
title: RF-041 CLI session persistence task package
document_type: task_package
domain: delivery
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-041：CLI 会话持久化

## 业务目标

测试人员创建会话后，可在 CLI 进程退出并重新启动后，通过同一会话 ID 从 Harness 恢复权威 Journey 状态。

## 输入与输出

输入是当前 namespace、ReleaseIdentity、MCP 和 Harness。输出是 `session start|resume|status` JSONL，以及连续的 Session/Journey 标识。

## 实现

- `session start` 使用现有 MCP `journey_prepare` 创建最小 Harness Journey，并将本地 DPAPI 记录绑定到返回的 Journey。
- `session status <id>` 从 Harness `journey_get(sessionRef)` 返回权威状态。
- `session resume <id>` 同样先从 Harness 回读，只返回可恢复状态，不执行模型或业务写入。
- DPAPI 文件仅保存控制器私有检查点与绑定，不成为 Journey 状态真相源。

## 项目易错点

- 不增加第二套 SQLite 或 CLI 自有业务状态表。
- 不允许用本地索引状态覆盖 Harness 状态。
- resume 不隐式批准提案、不调用模型、不重放变更。
- 旧 ReleaseIdentity 的会话不能在新身份下恢复。

## 验证

- CONTRACT：新语法严格解析，旧 `list/show/fork/archive` 不属于正式命令。
- INTEGRATION：隔离 MCP/Harness 投影中创建会话，重新初始化 DPAPI store 后按 sessionRef 回读相同 Journey。
- LIVE_E2E：不在本批次执行。

## 完成门

命令合同、权威回读、身份围栏和进程重启恢复测试全部通过；源码变化使旧 ReleaseIdentity 失效，但不在本批冻结新身份。
