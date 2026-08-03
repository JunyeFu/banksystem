---
id: DOC-ARCH-RF000-BASELINE
title: RF-000基线冻结记录
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# RF-000基线冻结记录

- Git根：`D:\Agent\banksystem`
- 分支：`agent/i10-flowise-formal-portable`
- HEAD：`dacd79580ec73f3580594ab2134acf8cc3d99f35`
- 捕获时间：`2026-08-01T20:50:01.7506600+08:00`
- ReleaseIdentity：`NOT_RUNNING_GOVERNANCE_ONLY`

本批次开始前已存在且归属不明/不属于本治理批次的修改包括 `agent/backlog.yaml`、`docs/current-state/capability-matrix.md` 以及衡准Flowise、MCP、构建器、验收脚本和一个未跟踪调度脚本。它们全部按用户既有改动保护，不在RF-000中暂存、覆盖、清理或宣称完成。

RF-000只建立控制资产；当前运行服务、数据库和18链验收状态不作为本批次完成证据。

## 回灌后增量观察（2026-08-02）

RF-000关闭前只读观察了回灌后的运行基线，用于证明治理切换没有改变产品运行身份；该观察不把业务运行结果冒充为RF-000实现成果。

- 仓库HEAD：`dacd79580ec73f3580594ab2134acf8cc3d99f35`，既有脏工作区继续保留。
- 导入包来源提交：`eede4f7af804c009222b53932547918ff9f57001`；它是发布包溯源字段，不等于当前仓库HEAD。
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`。
- 当前验收账本：`18/18`，`full18ChainAccepted=true`。
- 基线快照：`C:\tmp\i10-post-backfill-baseline.json`，SHA-256 `7419C6D2E9C2545243D2F4A2BB5CEA8A415A8A6D9561DE793F46D732248EBF4A`。临时快照只用于本次差异计算，持久证据见平台收口报告。
- 清单刷新前后的ReleaseIdentity、Agentflow源Hash、部署Hash及18链计数均未变化。
