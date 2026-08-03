---
id: DOC-ARCH-RF003-ROLLBACK
title: RF-003回滚手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003回滚手册

- 回滚点：`ba41e20`（RF-002 CLOSED）+ `baseline.md`。
- 触发条件：版本断言回归；ReleaseIdentity 或 18 链非预期变化；修改越出授权范围。
- 回滚动作：`git checkout ba41e20 -- <越界文件>` 或整体恢复；停止 RF-003 受管验证；不触碰其他脏文件。
- 恢复验证：三源版本一致性断言、全聚焦测试、运行身份比较、VERIFY。
- 演练：RF-001-B4-S3 通用回滚演练模式可复用。
