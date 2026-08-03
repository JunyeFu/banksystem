---
id: DOC-ARCH-RF004-ROLLBACK
title: RF-004回滚手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004回滚手册

- 回滚点：`70cf25f`（RF-003 CLOSED）+ `baseline.md`。
- 触发条件：凭据解析回归、任何凭据泄漏、ReleaseIdentity 或 18 链非预期变化、修改越出授权范围。
- 软回退：`HENGZHUN_RF004_LEGACY_CREDENTIAL=1`（保留 i3-customer 注入路径）→ 硬回退：`git checkout 70cf25f -- <越界文件>` + 受管重启。
- 恢复验证：凭据绑定测试、全聚焦测试、运行身份比较、VERIFY。
- 演练：RF-001-B4-S3 通用回滚演练模式可复用。
