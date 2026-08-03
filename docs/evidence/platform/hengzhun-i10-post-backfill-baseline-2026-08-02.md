---
id: DOC-EVIDENCE-HENGZHUN-I10-POST-BACKFILL-20260802
title: 衡准I10回灌后基线与证据收口
document_type: verification
domain: platform
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# 衡准I10回灌后基线与证据收口

## 身份与范围

- 仓库：`D:\Agent\banksystem`
- 分支：`agent/i10-flowise-formal-portable`
- HEAD：`dacd79580ec73f3580594ab2134acf8cc3d99f35`
- 导入包来源提交：`eede4f7af804c009222b53932547918ff9f57001`
- ReleaseIdentity：`632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`
- 当前工作区存在用户既有未提交修改；本次未清理、覆盖、广泛暂存、提交或推送。

## 实时运行证据

| 证据 | 结果 |
|---|---|
| Harness健康 | `status=ok`；迁移`36/36`；无待应用迁移 |
| Worker身份 | 期望/观测代码版本均为`6984b0b4de6843bd651cfd9c0494629605b56e7178f1a7e956badb147feb8349` |
| Flowise运行图 | Flow ID `7c14bafe-4c5b-4b4e-9d5a-000000000010`；版本7；`deployed=true`；`isPublic=false` |
| Flowise公开API回读 | 2026-08-02T09:16:22.410Z由项目发布脚本完成同版本私有发布与回读；`mock=false/degraded=false`；部署Flow Hash `ae3f51ac0406293095d7d888d34c91a38f370d1f33278b9d3a37d7a8e1b49a10`；Chatbot配置Hash `706f53989d18443b8e493db2f0c714272c93c37900b008c5234863ab9650849f` |
| 服务状态 | Harness、MCP、Worker、Flowise均为受管、健康且`businessReady=true` |
| 18链账本 | `currentPassed=18/18`；9组均为`SEMANTIC_MATCH`；`full18ChainAccepted=true` |
| 双模型探针 | `mock=false`、`degraded=false`；DeepSeek V4 Flash结构化输出/时间保持通过；MiMo v2.5真实截图结构化理解通过；均1次成功 |

## 文件完整性

首次复验在运行时资产`dist`发现清单摘要陈旧。逐文件SHA比较确认回灌目录与原桌面导出包的`dist`完全一致，故使用项目自带命令`i10-stage9-portable.cjs refresh-manifest --rehash-assets`重算清单，没有替换运行资产。

最终`VERIFY.cmd --no-pause`结果：

```text
status=I10_PORTABLE_FOLDER_VERIFIED
manifestSha256=9be5f6f8f9be29294be6ea124e813f2e999a79191008663fda1b6d165501150e
coreFileCount=285
assetCount=6
forbiddenFindingCount=0
```

## 差异证明

以回灌后快照进行前后比较：

- `identityUnchanged=true`
- `sourceHashUnchanged=true`
- `deployedHashUnchanged=true`
- `beforeCurrentPassed=18`
- `afterCurrentPassed=18`
- `currentPassedDelta=0`

因此，本次清单修正与治理收口没有改变已验收产品身份或18链结果。该证据只证明当前本机目录与当前运行态，不外推为另一台电脑、HiAgent服务器或所有Windows环境已验收。
