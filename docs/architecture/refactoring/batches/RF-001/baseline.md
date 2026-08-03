---
id: DOC-ARCH-RF001-BASELINE
title: RF-001基线冻结记录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# RF-001基线冻结记录

- 仓库HEAD：`dacd79580ec73f3580594ab2134acf8cc3d99f35`
- 分支：`agent/i10-flowise-formal-portable`
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`
- Flowise：v7，公开API回读`deployed=true`，当前部署Hash已与发布清单匹配。
- Harness迁移：`36/36`；Worker身份匹配；I10账本`18/18`。
- MCP公开面：33个命名工具，MCP只作为Flowise到Harness的受控适配边界。
- 完整性：`I10_PORTABLE_FOLDER_VERIFIED`，285个核心文件、6组资产、0个禁止项。

工作区在本批次开始前已包含回灌和I10收口改动。RF-001只允许触碰`batch.yaml`列出的路径，不要求清理、暂存或覆盖其他改动。详细运行证据见`docs/evidence/platform/hengzhun-i10-post-backfill-baseline-2026-08-02.md`。
