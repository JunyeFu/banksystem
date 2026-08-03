---
id: DOC-ARCH-RF000-VERIFY
title: RF-000验证计划
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# RF-000验证计划

1. 运行重构Schema、模块清单和批次制品校验。
2. 运行文档元数据、链接、过期路径和唯一实施顺序校验。
3. 运行差异格式检查。
4. 检查Git状态，确认业务脏文件未被RF-000改写。

任何阻断命令非零退出时，RF-000不得进入 `CONTRACT_APPROVED`；只有全部门禁重跑通过、控制切换完成并进入观察后，才能依次进入 `ACCEPTED / CLEANUP_ELIGIBLE / CLOSED`。
