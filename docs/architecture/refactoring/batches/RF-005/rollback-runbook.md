---
id: DOC-ARCH-RF005-ROLLBACK
title: RF-005回滚手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005回滚手册

- 回滚点：`d914998`（RF-004 CLOSED）+ `baseline.md`。
- 触发条件：v7 回归（i10 路由断裂）、错误码清单漂移、ReleaseIdentity 或 18 链非预期变化、修改越出授权范围。
- 回滚动作：`git checkout d914998 -- <越界文件>` 或整体恢复；停止 RF-005 受管验证；不触碰其他脏文件。
- 恢复验证：单路由测试、全聚焦测试、运行身份比较、VERIFY。
