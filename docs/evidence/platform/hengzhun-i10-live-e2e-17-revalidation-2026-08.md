---
id: DOC-EVIDENCE-HENGZHUN-I10-LIVE-E2E-17-2026-08
title: 当前ReleaseIdentity剩余17条LIVE_E2E补验证据索引
document_type: evidence
domain: platform
status: active
authority: informative
version: 1.0
effective_date: 2026-08-04
owner: project-owner
---

# 当前ReleaseIdentity剩余17条LIVE_E2E补验证据索引

## 冻结口径

```text
ReleaseIdentity = 6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687
before.currentPassed = 1
required = 18
taskPackage = agent/plans/active/hengzhun-i10-live-e2e-17-revalidation-task-package.md
```

执行前快照：`C:\tmp\i10-live17-before-execution.json`。该文件是本机执行快照，不纳入Git产品制品。

## P0：发布回读与身份冻结

执行时间：2026-08-04 10:29—10:30（Asia/Shanghai）。

执行入口：

```powershell
& 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' -Root 'D:\Agent\banksystem\platform\hengzhun-regression-system' -SnapshotPath 'C:\tmp\i10-live17-before-execution.json'
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-agentflow-publish.cjs
```

机器结果：

- 公共API发布回读：`mock=false`、`degraded=false`、`deployed=true`、`private=true`。
- Source Flow Hash：`eb1c56edeae6ff2d21fc341378a197d8b5d87f10337ed6d8f54498d6c7d87191`。
- Deployed Flow Hash：`c4878709c4d0c0b169e72d2c340b1376c2fac961be849826d88b84dc6b8a5e27`。
- 发布证据：`platform/hengzhun-regression-system/.data/evidence/i10/flowise/publication.json`。
- 刷新前后ReleaseIdentity、sourceHash、deployedHash均不变。
- 四个受管服务健康且为当前代码，迁移36/36，WorkerCodeSet 24文件一致。
- P0后账本仍为`1/18`。

## P1：L1 TEXT_WITH_IMAGE

执行时间：2026-08-04 10:30—10:35（Asia/Shanghai）。

执行命令：

```powershell
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run L1 TEXT_WITH_IMAGE
```

终态：

```text
exitCode = 0
status = PASSED
recordId = acceptance_8ae7958f-be0b-4cd6-9e62-9b8d1e9eb7a4
caseId = L1
variant = TEXT_WITH_IMAGE
pairStatus = SEMANTIC_MATCH
elapsed = 274.1 seconds
ledger = 2/18
ledgerDelta = +1
historicalStale = 16
identityUnchanged = true
```

脱敏证据指针：

- 运行目录：`platform/hengzhun-regression-system/.data/evidence/i10/acceptance-records-v3/runs/record-l1-text_with_image-2026-08-04T02-30-42-851Z-08e61d/`。
- 候选：`candidate_23859b5989911b71932331b21856bc7e53c7bc47`。
- 脚本Hash：`a23f233fe996315ad5283a04b26685a208910a1ea5e8cc7ba19c69ed4374d72e`。
- 2×2证书：`certificate_b5ef3eee94be9be52775d39def9e88b9b66e8701`，包含4个唯一Run。
- 激活：`DIRECT_ACTIVATE`且`verified=true`。
- 正式执行任务：`task_b9d87dc2-4cb1-4582-8f81-f418f40a9275`，模式`ON_DEMAND`。
- 结果收件箱：`inbox_a13c0ea0-7b92-4f2c-81e6-2192b2fac492`。
- 终态Artifact：`art_f660209c-571f-4b8d-8b32-38ffaab7c889`。
- 运行结果：`platform/hengzhun-regression-system/.data/evidence/i10/acceptance-records-v3/runs/record-l1-text_with_image-2026-08-04T02-30-42-851Z-08e61d/run-result.json`。

本记录证明当前身份下L1文字/图片两条链语义一致，并完整经过图片/OCR、作者化、Builder、纯Playwright、2×2、激活、正式执行、结果回读和Artifact门槛。它不证明剩余L2-H3已经通过。

## 当前状态与下一门槛

```text
currentPassed = 2/18
full18ChainAccepted = false
earned = P0_COMPLETED + P1_L1_PAIR_COMPLETED
notEarned = I10_FLOWISE_18_CHAIN_ACCEPTED
```

下一阶段是P2：依次执行L2 `TEXT_ONLY`、L2 `TEXT_WITH_IMAGE`、L3 `TEXT_ONLY`、L3 `TEXT_WITH_IMAGE`。P2尚未获得执行授权。

## P2：L2/L3轻度案例补验

执行时间：2026-08-04 10:44—10:52（Asia/Shanghai）。执行前账本为`2/18`，P2快照为`C:\tmp\i10-p2-before.json`。

| 案例 | 变体 | recordId | 耗时 | 2×2证书 | 正式执行 | 终态 |
|---|---|---|---:|---|---|---|
| L2 | `TEXT_ONLY` | `acceptance_cfb05585-3a99-4dbc-a0a4-698fda195ae8` | 73.2秒 | `certificate_6c10b4e13948d88f90976d6032ac61873cf80810` | `task_2e8902e0-3497-4cf4-a0d0-768c9f9ca014` | `PASSED` |
| L2 | `TEXT_WITH_IMAGE` | `acceptance_76c89ac8-d90f-4419-88a7-bb3debc644e9` | 102.8秒 | `certificate_8082060e5156256795d1ce6b618992682b62110f` | `task_4313f91f-ebbd-4a73-b897-8ef9595bcb0c` | `PASSED` |
| L3 | `TEXT_ONLY` | `acceptance_7da162cf-db9a-4d6d-986c-f11f9c45fa62` | 72.6秒 | `certificate_ff7e4b236d514603ceb4e39c327fb25afef4aa55` | `task_4c069f3e-d75f-4506-b728-3f4afdfdc412` | `PASSED` |
| L3 | `TEXT_WITH_IMAGE` | `acceptance_91a48cbf-5dd0-4523-a998-9b109e41b84a` | 107.9秒 | `certificate_adf3f399f7840b99fd51da1e8c983833c97a9aee` | `task_77131358-8f95-4516-90b5-d4695e6fcdc6` | `PASSED` |

四条记录均满足：

- ReleaseIdentity精确等于冻结值。
- 每个证书含4个唯一稳定性Run。
- `DIRECT_ACTIVATE`且`verified=true`。
- `ON_DEMAND`正式执行完成，具有结果收件箱和终态Artifact。
- L2与L3文字/图片语义对均为`SEMANTIC_MATCH`。

P2终态：

```text
before = 2/18
after = 6/18
ledgerDelta = +4
historicalStale = 12
identityUnchanged = true
sourceHashUnchanged = true
deployedHashUnchanged = true
full18ChainAccepted = false
```

## P3：M1/M2/M3中度案例补验（已停止）

2026-08-04用户批准P3。执行严格按文字后图片顺序进行，并在M3图片链首个确定性失败处停止。

| 案例 | 变体 | recordId | 耗时 | 原始终态 |
|---|---|---|---:|---|
| M1 | `TEXT_ONLY` | `acceptance_f000571f-fc1c-40a3-abb9-a327eee3b5c4` | 239.6秒 | `PASSED` |
| M1 | `TEXT_WITH_IMAGE` | `acceptance_156bdd9a-9f66-4c0d-98ff-80dbb43e8749` | 339.7秒 | `PASSED` |
| M2 | `TEXT_ONLY` | `acceptance_72d949ac-6949-4a21-9b33-8ec4f45f9805` | 91.8秒 | `PASSED` |
| M2 | `TEXT_WITH_IMAGE` | `acceptance_bd9f29e2-6077-4b45-b385-a8f8800e888f` | 300.5秒 | `PASSED` |
| M3 | `TEXT_ONLY` | `acceptance_e78e6277-9e4a-402a-8dac-90a42ccb357a` | 92.4秒 | `PASSED` |
| M3 | `TEXT_WITH_IMAGE` | 无PASSED记录 | 115.4秒 | `FAILED_ACTIONABLE` |

M3图片链失败旅程为`journey_e71e5b56-fdc4-4bb3-b275-1e1ce3858fc3`，作者化任务为`buildjob_4205f178-9d7d-49f6-a994-38add3c26f48`，直接失败阶段为`MIDSCENE_LOCATE`，错误码为`I10_MIDSCENE_LOCATOR_MISMATCH`，语义目标为`HEADER_DISPLAY_NAME`。

### 语义计划审计与证据降级

M3冻结草案是“门户文档查询”，但执行计划被错误选择为`LOGIN_PROFILE`，包含与文档查询无关的头像、姓名和个人资料比较动作。根因位于确定性Builder的受控案例判定：只要存在`fuxing-bank-demo`适配器绑定就选择登录模板，没有同时核对业务语义。

该缺陷会影响所有绑定复兴银行适配器但并非登录资料一致性场景的案例。因而：

- 旧身份原始账本仍不可变地记录`11/18`。
- 该数字不再代表11条业务语义正确的LIVE_E2E证据。
- 当前可继续信任的业务链仅为L1文字和图片两条，即`2/18`。
- L2、L3、M1、M2及M3文字链保留为历史机器事实，但必须在修复后的新ReleaseIdentity下重验。

### 源码修复状态

已完成但尚未部署：

- 登录模板选择增加业务语义门槛；适配器绑定不再单独触发登录模板。
- Stage8识别作者化失败终态，返回`I10_STAGE8_AUTHORING_FAILED_NO_IMPLICIT_RETRY`，不再误报缺少调度终态。
- M3图片恢复检查点只有在确认零副作用后才允许新建执行。

构建与57项聚焦测试全部通过。2026-08-04 12:40（Asia/Shanghai）只读检查器观察到：文件系统计算身份已从P3冻结值漂移为`2a173f90b9b915e20df3eb1a68cd134a3ded9b76d1916c0c8a54ae20fe51df51`，当前账本为`0/18`、历史集合为`18`；Worker完整文件集`hashMatch=false`、`codeSetReady=false`，公共API回读证据为过期状态。该结果证明源码修复尚未形成一致的受管运行版本，P3未关闭，P4未启动。

检查器同时报告`releaseAligned=true`仅表示当前文件系统各身份输入可被一致计算，不表示受管Worker已加载当前文件集，也不表示公共API回读新鲜；因此不得据此恢复LIVE_E2E。

下一阶段必须另建并批准“适配器路由修复、受管重载、Flowise回读和新ReleaseIdentity重基线”任务；新身份下从P0/P1重跑至P3并获得12条可信记录后，才允许进入P4。

## 2026-08-04 快速停止与重基线后首错记录

用户要求停止继续运行并快速收口后，未再启动任何案例、全量测试、发布或服务生命周期命令。受管重载与Flowise公共API发布回读此前已经完成，主控模型与视觉模型真实探针通过；当前运行身份冻结为：

```text
ReleaseIdentity = 4848b65aa8bad2305acfba8742d3ecb2f2703de1f45884b5c54aa256050d6eaf
WorkerCodeSetHash = f322c1c8598bde486ef8cc07ca1e6e06487ed4ff44f86b55195ea4d8fceb512e
migrationVersion = 36
currentPassed = 0/18
historicalStale = 29
full18ChainAccepted = false
```

新身份下首先执行L1 `TEXT_ONLY`，运行目录为：

```text
platform/hengzhun-regression-system/.data/evidence/i10/acceptance-records-v3/runs/record-l1-text_only-2026-08-04T08-11-56-831Z-87b05a
```

该运行只形成`L1-00`至`L1-02`三个阶段快照，没有`run-result.json`，不得登记为`LIVE_E2E PASSED`。作者化已生成候选`candidate_9f0ecef1742e63ca5aff2493f207fa91084e032b`，但2×2稳定性批次以`VALIDATION_FAILED`结束，四条验证记录均报告`CANDIDATE_ROUTE_NOT_ALLOWLISTED`。

同时确认一个独立的控制流缺陷：候选预览轮询把`I8_STABILITY_CERTIFICATE_REQUIRED`无条件视为“仍在处理”，即使候选和稳定性批次已进入`VALIDATION_FAILED`终态仍持续轮询，最终由外层十分钟时限终止。这解释了本轮表面上的长时间无结果，但不改变稳定性验证已失败的事实。

本轮已经完成的代码改动仅处于“已构建、已测试、尚未形成新LIVE_E2E证据”状态：

- 通用候选的允许导航来源改为冻结的HTTP/HTTPS origin集合；
- 通用登录宏增加真实`waitForURL`步骤；
- `waitForURL`等待离开冻结启动页并进入允许origin；
- 登录专用模板继续受业务语义门槛约束；
- 相关聚焦测试`27/27`、I10 Journey全量测试`226/226`通过。

停止时不得宣称P3完成，也不得复用旧身份下的通过记录。下一阶段只允许先修复并验证以下两个首错：

1. 查清并修复生成候选中的`CANDIDATE_ROUTE_NOT_ALLOWLISTED`；
2. 候选或稳定性进入终态失败后立即向上返回具体失败，不再无限轮询。

上述两项通过聚焦测试、受管重载和发布回读后，先重跑L1文字/图片双链；只有同一ReleaseIdentity达到`2/18`，才重新申请进入P2/P3，P4仍未获准。
