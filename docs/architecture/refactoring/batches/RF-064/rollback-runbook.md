---
id: RF064-ROLLBACK
title: 恢复边界
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-08
owner: Codex
---

# 恢复边界

新反馈或调度发现错动作时停止对应新任务，保留原脚本与失败证据。程序恢复不撤销已入账；未知操作查原关联，不重提。数据库迁移按实际版本处理，不执行全局reset/down或删卷。

