---
id: DOC-ARCH-RF004-TARGET
title: RF-004目标设计——执行凭据绑定权威化（F08）
document_type: design
domain: architecture
status: PROPOSED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004目标设计

## 1. 现状事实（代码级，2026-08-03）

| # | 位置 | 事实 |
|---|---|---|
| C1 | `mcp/src/server.cjs` run_submit/schedule_create | `normalizeCredentialBinding()` 冻结注入 `credentialAlias: 'i3-customer'`（RF-001 B2 决策 8：仅旧兼容行为登记） |
| C2 | `harness/src/service.ts` enqueueRun（L308-350） | credentialAlias 写入 task payload_json 与 runs.credential_alias → Worker 领取后按别名解析门户凭据 |
| C3 | `harness/src/service.ts` L1670（候选稳定性验证） | `credentialAlias: 'i3-customer'` 硬编码；但 `I10_2X2_V1` 且 definition.credentialRef 存在时透传 credentialRef + entryUrl（**验证路径已支持权威凭据引用**） |
| C4 | `harness/src/schemas.ts` L183/206/234/243 | credentialAlias 为 boundedText（可选/必填视工具） |
| C5 | v7 agentflow | run_submit/schedule_create 调用均不传 credentialAlias（MCP 内部注入）→ 迁移在 MCP/Harness 内部，Flowise 零改动 |

**结论**：凭据绑定（i3-customer）是"旧兼容行为"登记（RF-001 B2 决策 8 明确"通用目标切换前必须由权威执行凭据绑定替代"）；验证路径已有 credentialRef 透传先例（C3）。RF-004 = 把正式执行（run_submit/schedule_create → enqueueRun）的凭据来源从隐式 i3-customer 迁移为权威 credentialRef 绑定。

## 2. 单一变化轴

**正式执行凭据绑定权威化**：run_submit/schedule_create 的凭据来源从 MCP 硬编码 `i3-customer` 迁移为 case 权威 `credentialRef`（经 DPAPI 凭据会话的本机解析链）。不改变工具名、v7 消费面、状态契约、信封、身份。

**明确排除**：
- 不改 Worker（凭据解析执行方零改动——Worker 已按 payload 的 credentialAlias/credentialRef 工作）
- 不改 Flowise（v7 冻结）；不改 SQLite 表结构（runs.credential_alias 列保持，新增可选值语义）
- 不引入任何新凭据存储（凭据仍在 DPAPI 本机会话）

## 3. 目标状态（子项级）

### B1 执行凭据来源契约化（MCP 侧）
- 现状：`normalizeCredentialBinding()` 无参冻结 i3-customer
- 目标：`normalizeCredentialBinding(credentialRef)`——从 case 上下文解析权威执行凭据绑定：
  - case 已确认 credentialRef → 解析为该凭据（幂等键含 credentialRef 派生）
  - 无 credentialRef → 失败关闭 `I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED`（新错误码，入 matrix/合同）
  - **兼容期开关**：`HENGZHUN_RF004_LEGACY_CREDENTIAL=1` 时回退 i3-customer（软回退，类比 RF-001 LEGACY_ERROR）
- 验证：MCP 聚焦测试断言绑定解析三分支

### B2 Harness 执行链路凭据传递（Harness 侧）
- 现状：enqueueRun 收 credentialAlias（i3-customer）
- 目标：enqueueRun 收 `credentialAlias + credentialRef?`——credentialRef 存在时写入 runs 表与 task payload（对齐 C3 验证路径先例）；Worker 端解析逻辑不变（payload 已含权威引用）
- 验证：harness 隔离运行态测试（enqueueRun 写入断言）

### B3 边界合同更新
- 现状：run_submit/schedule_create acceptedAliases 含 `implicit credentialAlias=i3-customer`（until: B4 credentialRef consumer migration——注意 B4 指 RF-001-B4，已过）
- 目标：until 更新为 RF-004 迁移完成；canonicalRequest 增加 credentialRef 派生说明；FROZEN_EXECUTION_CREDENTIAL_ALIAS 冻结解除
- 验证：validate_rf001_contract.py PASS（aliases=13 不变）

### B4 全链路验证
- 目标：复兴银行门户真实案例（含 credentialRef）走完 run_submit 执行链；credentialRef 缺失案例失败关闭；LEGACY 开关回退旧行为
- 验证：隔离运行态 + 生产切流探测（用户批准后）

## 4. 模块所有者与依赖

| 项 | 归属 |
|---|---|
| 凭据来源契约 | MCP（normalizeCredentialBinding 扩展，仅引用解析不触凭据原文） |
| 凭据传递与持久化 | Harness（enqueueRun 扩展；runs 表既有列） |
| 凭据解析执行 | Worker（零改动） |
| 消费者 | Flowise v7（零改动） |

## 5. 失败关闭与安全

- credentialRef 缺失/无效 → 明确错误码，不静默回退（除 LEGACY 开关显式启用）
- 任何错误路径不输出凭据原文/别名哈希（脱敏审计沿用 RF-001 模式）
- 幂等：凭据派生进幂等键（同 credentialRef+preparationId 幂等）

## 6. 切片链建议

1. **RF-004-S1** 凭据绑定考古与基线（零代码：C1-C5 现状断言机器化、v7 消费面复核）
2. **RF-004-S2** MCP 绑定契约（normalizeCredentialBinding 三分支 + LEGACY 开关 + 聚焦测试）
3. **RF-004-S3** Harness 传递（enqueueRun credentialRef + 隔离运行态测试）
4. **RF-004-S4** 生产切流、观察与批次关闭（受管重启 + 真实案例执行链探测 + batch CLOSED + RF-005 解禁）

## 7. 批准要求

本设计经用户批准后成为 RF-004 唯一变化轴授权。
