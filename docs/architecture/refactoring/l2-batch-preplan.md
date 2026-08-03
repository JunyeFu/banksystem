---
id: DOC-ARCH-L2-BATCH-PREPLAN
title: L2 批次预规划（RF-003/004/005 batch.yaml 草案 + 顺序与接口衔接）
document_type: planning
domain: architecture
status: ACCEPTED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# L2 批次预规划

> 依据：L1 重构全景规划（v54 重构章节，用户已批准 2026-08-03）。**2026-08-03 用户确认**：① 顺序链 RF-002→003→004→005（含 RF-004/005 可并行 IMPLEMENTING 假设）；② 三个 batch.yaml 草案为“批准后直接落盘”模板；③ 接口衔接矩阵 C1-C5 维持不变。本文件预起草 RF-003/RF-004/RF-005 的批次定义（batch.yaml 草案）并明确先后顺序与上下接口衔接。
> **候选声明**：RF-003/004/005 在本文件批准前不构成授权；逐批经用户批准后，将本文件对应草案落盘为 `batches/RF-0xx/batch.yaml`（连同 9 制品，满足校验器）。

## 1. 批次顺序与依赖

```text
RF-002（状态所有权收敛）───► RF-003（版本来源统一）───► RF-004（凭据绑定迁移）───► RF-005（双路由退场）
     │ S2 产出 terminal/verificationGate 契约               │
     │ S3 产出 MCP 收敛（无状态推断）                       │
     └──►（G4 预读版本绑定契约确认：run_submit/schedule_create 请求形状锁定）┘
```

**顺序理由**（接口衔接驱动，非任意排序）：

| 依赖 | 理由 |
|---|---|
| RF-003 依赖 RF-002 | RF-002 新增状态契约字段（terminal/verificationGate）进入响应契约；RF-003 统一版本来源时须把新契约纳入单一版本管理，避免"先统一、后加字段"两次漂移 |
| RF-004 依赖 RF-003 | 凭据迁移会触碰 run_submit/schedule_create 的请求契约与错误码；版本来源统一先落地，迁移期间的版本断言（合同/健康/清单三源）才有一致基线 |
| RF-004 依赖 RF-002-G4 | RF-002-G4 锁定"预读版本绑定 MCP 组装 + Harness 校验"契约与 `normalizeCredentialBinding`（i3-customer 冻结）；RF-004 迁移该绑定时须更新 G4 断言与边界合同 `until` 字段（**衔接点 C2**） |
| RF-005 依赖 RF-002 | RF-002-S4 的消费者审计方法论（agentflow 工具节点审计）复用；且避免两个批次同时动 case_prepare 契约 |
| RF-005 依赖 RF-004 | i8 路由退场前消除隐式凭据负担（i3-customer 兼容逻辑与 I8 草案路由同代退场），减少兼容层交织 |

**并行约束**（L1 第 5 节沿用）：同刻 ≤1 CUTOVER、≤2 IMPLEMENTING；RF-003 与 RF-005 不共享合同文件，可并行 IMPLEMENTING（若预算允许）；RF-004 与其余批次共享 `contracts/mcp/hengzhun-i8.json`，禁止并行切流。

## 2. 接口衔接矩阵

| 衔接点 | 上游批次产出 | 下游批次消费 | 契约/断言变更 |
|---|---|---|---|
| C1 | RF-002：tasks/candidates:get 新增 terminal/verificationGate | RF-003：纳入统一版本契约（contractVersion 管理） | RF-003 合同测试断言新字段随版本契约版本化 |
| C2 | RF-002-G4：`normalizeCredentialBinding` 冻结 i3-customer + 聚焦测试断言（credentialAlias: binding.credentialAlias ×2） | RF-004：替换为权威 credentialRef 绑定 | RF-004 更新 G4 断言、边界合同 `until: B4 credentialRef consumer migration` → 已迁移；`FROZEN_EXECUTION_CREDENTIAL_ALIAS` 冻结解除 |
| C3 | RF-002-S4：条件写收口方法论（消费者审计+退场登记） | RF-005：case_prepare I8 草案入口退场审计 | RF-005 复用 agentflow 工具节点审计流程；contract-delta 登记 |
| C4 | RF-001（已关闭）：错误码清单测试（B4-S1）锁定 I8_DRAFT_JSON_INVALID 等 | RF-005：i8 路由退场删除相关错误码 | RF-005 须同步更新 B4-S1 错误码清单测试（错误码删除=预期变更，走决策日志登记） |
| C5 | RF-003：版本单一来源 | RF-004/005：迁移期版本断言基线 | 三源一致性断言（合同/健康/清单）成为 RF-004/005 的回归门禁 |

## 3. RF-003 batch.yaml 草案（版本来源统一，F09）

```yaml
schemaVersion: 1
id: RF-003
title: 统一版本来源（MCP SDK 8.0.0 / 健康 10.0.0 / 合同 10.1.0 单一来源）
status: PROPOSED
owner: project-owner
authorizedBy: agent/plans/active/v54-implementation-batches.md
scope:
  includePaths:
    - platform/hengzhun-regression-system/mcp/src
    - platform/hengzhun-regression-system/contracts
    - platform/hengzhun-regression-system/scripts/verification
    - docs/architecture/refactoring/batches/RF-003
    - docs/current-state
    - scripts/architecture
  excludePaths: [platform/hengzhun-regression-system/flowise, platform/hengzhun-regression-system/worker, platform/hengzhun-regression-system/harness, apps, services, infra, data, .data, secrets, .env]
budgets: {maxChangedFiles: 12, maxNewFiles: 4, maxChangedLines: 800, maxContractsChanged: 1, maxMigrationsAdded: 0, maxOpenModules: 1}
baseline:
  gitCommit: <RF-002 CLOSED 提交>
  dirtyTreeManifest: docs/architecture/refactoring/batches/RF-003/baseline.md
  releaseIdentity: 632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f
architecture:
  businessCapability: hengzhun-version-unification
  publicContract: platform/hengzhun-regression-system/contracts/mcp/hengzhun-i8.json
  allowedModules: [hengzhun.mcp]
  forbiddenModules: [hengzhun.harness, hengzhun.flowise, hengzhun.worker, bank.identity, bank.accounts, bank.payments]
mustPreserve:
  - 33 工具名/13 别名/8 字段信封（RF-001 基线）
  - terminal/verificationGate 契约（RF-002 产出，C1）
  - ReleaseIdentity 632ad5ee；18 链 18/18
verification:
  requiredCommands:
    - {name: rf003-version-contract, command: 三源版本一致性断言（合同/健康/清单），expectedExitCode: 0, blocking: true}
    - {name: rf001-focused-tests, command: 全聚焦回归（RF-001 7 文件 + RF-002 S1），expectedExitCode: 0, blocking: true}
    - {name: refactoring-contracts, command: python scripts/architecture/validate_refactoring.py，expectedExitCode: 0, blocking: true}
    - {name: documentation, command: python scripts/docs/validate_docs.py，expectedExitCode: 0, blocking: true}
rollback: {triggerConditions: [版本断言回归，ReleaseIdentity 变化], recoveryPoint: <RF-002 CLOSED 提交>, maxRtoMinutes: 30, maxRpoMinutes: 0}
exceptions: {allowedVagueNames: [], crossModule: []}
```

## 4. RF-004 batch.yaml 草案（执行凭据绑定迁移，F08）

```yaml
schemaVersion: 1
id: RF-004
title: 执行凭据绑定迁移（run_submit/schedule_create 隐式 i3-customer → 权威 credentialRef）
status: PROPOSED
owner: project-owner
authorizedBy: agent/plans/active/v54-implementation-batches.md
scope:
  includePaths:
    - platform/hengzhun-regression-system/mcp/src
    - platform/hengzhun-regression-system/harness/src/i10
    - platform/hengzhun-regression-system/contracts
    - platform/hengzhun-regression-system/scripts/verification
    - docs/architecture/refactoring/batches/RF-004
    - docs/current-state
  excludePaths: [platform/hengzhun-regression-system/flowise, platform/hengzhun-regression-system/worker, apps, services, infra, data, .data, secrets, .env]
budgets: {maxChangedFiles: 16, maxNewFiles: 6, maxChangedLines: 1200, maxContractsChanged: 1, maxMigrationsAdded: 0, maxOpenModules: 2}
baseline:
  gitCommit: <RF-003 CLOSED 提交>
  dirtyTreeManifest: docs/architecture/refactoring/batches/RF-004/baseline.md
  releaseIdentity: 632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f
architecture:
  businessCapability: hengzhun-execution-credential-binding
  publicContract: platform/hengzhun-regression-system/contracts/mcp/hengzhun-i8.json
  allowedModules: [hengzhun.mcp, hengzhun.harness]
  forbiddenModules: [hengzhun.flowise, hengzhun.worker, bank.identity, bank.accounts, bank.payments]
mustPreserve:
  - 33 工具名/13 别名/8 字段信封；v7 消费者零改动（Flowise 不传 credentialAlias，迁移在 MCP/Harness 内部）
  - RF-002-G4 预读版本绑定组装模式（仅替换凭据来源）
  - ReleaseIdentity 632ad5ee；18 链 18/18
verification:
  requiredCommands:
    - {name: rf004-credential-binding, command: 权威凭据绑定测试（credentialRef 解析、缺失失败关闭、无凭据泄漏），expectedExitCode: 0, blocking: true}
    - {name: rf001-focused-tests, command: 全聚焦回归（含 RF-002 G4 断言更新，C2），expectedExitCode: 0, blocking: true}
    - {name: refactoring-contracts, command: python scripts/architecture/validate_refactoring.py，expectedExitCode: 0, blocking: true}
    - {name: documentation, command: python scripts/docs/validate_docs.py，expectedExitCode: 0, blocking: true}
rollback: {triggerConditions: [凭据解析回归、任何凭据泄漏、ReleaseIdentity 变化], recoveryPoint: <RF-003 CLOSED 提交>, maxRtoMinutes: 30, maxRpoMinutes: 0}
exceptions: {allowedVagueNames: [], crossModule: [hengzhun.mcp may depend on hengzhun.harness only through the frozen public contract and explicit adapter]}
```

## 5. RF-005 batch.yaml 草案（case_prepare 双路由退场，F07）

```yaml
schemaVersion: 1
id: RF-005
title: case_prepare I10/I8 双路由退场与 I8 草案入口删除（F07）
status: PROPOSED
owner: project-owner
authorizedBy: agent/plans/active/v54-implementation-batches.md
scope:
  includePaths:
    - platform/hengzhun-regression-system/mcp/src
    - platform/hengzhun-regression-system/contracts
    - platform/hengzhun-regression-system/scripts/verification
    - docs/architecture/refactoring/batches/RF-005
    - docs/current-state
  excludePaths: [platform/hengzhun-regression-system/flowise, platform/hengzhun-regression-system/worker, platform/hengzhun-regression-system/harness, apps, services, infra, data, .data, secrets, .env]
budgets: {maxChangedFiles: 14, maxNewFiles: 5, maxChangedLines: 1000, maxContractsChanged: 1, maxMigrationsAdded: 0, maxOpenModules: 1}
baseline:
  gitCommit: <RF-004 CLOSED 提交>
  dirtyTreeManifest: docs/architecture/refactoring/batches/RF-005/baseline.md
  releaseIdentity: 632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f
architecture:
  businessCapability: hengzhun-case-route-retirement
  publicContract: platform/hengzhun-regression-system/contracts/mcp/hengzhun-i8.json
  allowedModules: [hengzhun.mcp]
  forbiddenModules: [hengzhun.harness, hengzhun.flowise, hengzhun.worker, bank.identity, bank.accounts, bank.payments]
mustPreserve:
  - 33 工具名不变（case_prepare 保留，仅删内部 i8 路由与 I8 草案入口）
  - v7 消费者证据：agentflow-v7 仅 draftJson（i10 路由）调用 case_prepare；draftArray/acceptanceSummaryJson 零调用
  - ReleaseIdentity 632ad5ee；18 链 18/18
verification:
  requiredCommands:
    - {name: rf005-single-route, command: case_prepare 单路由测试（i10 全路径 + i8 入口失败关闭/移除断言），expectedExitCode: 0, blocking: true}
    - {name: rf001-focused-tests, command: 全聚焦回归（含 B4-S1 错误码清单更新，C4），expectedExitCode: 0, blocking: true}
    - {name: refactoring-contracts, command: python scripts/architecture/validate_refactoring.py，expectedExitCode: 0, blocking: true}
    - {name: documentation, command: python scripts/docs/validate_docs.py，expectedExitCode: 0, blocking: true}
rollback: {triggerConditions: [双路由删除后 v7 回归、错误码清单漂移、ReleaseIdentity 变化], recoveryPoint: <RF-004 CLOSED 提交>, maxRtoMinutes: 30, maxRpoMinutes: 0}
exceptions: {allowedVagueNames: [], crossModule: []}
```

## 6. 接口衔接的强制断言归属

| 衔接点 | 断言载体 | 触发时机 |
|---|---|---|
| C1 | RF-003 版本契约测试 | RF-003 实现期 |
| C2 | RF-004 更新 RF-002-G4 断言 + 边界合同 until | RF-004 实现期（RC-D1 回写 RF-002 文档） |
| C3 | RF-005 消费者审计报告（复用 RF-002-S4 方法论） | RF-005-S1 |
| C4 | RF-005 更新 B4-S1 错误码清单测试 | RF-005 实现期（决策日志登记预期变更） |
| C5 | 三源版本一致性断言成为 RF-004/005 回归门禁 | RF-003 后所有批次 |

## 7. 待确认项

1. 顺序链 RF-002→003→004→005 是否批准（RF-004 与 RF-005 可并行 IMPLEMENTING 的假设）；
2. 三个 batch.yaml 草案是否批准为"批准后直接落盘"模板；
3. 接口衔接矩阵 C1-C5 是否补充或调整。
