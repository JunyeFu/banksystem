---
id: DOC-ARCH-RF001-ROLLBACK
title: RF-001回滚手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# RF-001回滚手册

触发条件包括合同兼容失败、错误码语义漂移、ReleaseIdentity或18链非预期变化、修改越界。回滚时恢复本批次范围内的旧适配器与合同，停止RF-001受管验证，不触碰其他脏文件；随后重新运行MCP合同、Harness I10测试、运行身份比较和VERIFY。未形成可独立回退的范围提交前不得进入切换阶段。

## 演练记录（2026-08-03）

- B4-S3已完成回滚演练（CONTRACT_DRILL）：错误码漂移注入→检测器失败（可机器检测）；`git show dacd795:<server.cjs>`恢复基线+移除RF-001产物→node --check通过、33工具完整、身份不变、检测器恢复绿；真实工作区零改动。
- B4-S4切流后软回退通道：`HENGZHUN_RF001_LEGACY_ERROR=1` 恢复旧错误形状（隔离验证通过），必要时叠加 git 恢复硬回退。
