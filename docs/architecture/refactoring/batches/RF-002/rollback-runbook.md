---
id: DOC-ARCH-RF002-ROLLBACK
title: RF-002回滚手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-002回滚手册

- 回滚点：`3582a6416c4d63169d135d23513ab7e37dc690cb`（RF-002执行基线，含RF-001全部成果）+ `baseline.md`脏树清单。
- 触发条件：ReleaseIdentity或18链非预期变化；修改越出最终授权范围；target-design未批准前开始实施。
- 回滚动作：`git checkout 3582a641 -- <越界文件>` 或整体恢复到基线提交；停止RF-002受管验证；不触碰其他脏文件。
- 恢复验证：MCP合同（validate_rf001_contract.py）、聚焦测试、运行身份比较、VERIFY。
- 演练：RF-001-B4-S3已完成通用回滚演练模式（漂移检测→基线恢复→验证绿），RF-002切流类变更按需复用。
