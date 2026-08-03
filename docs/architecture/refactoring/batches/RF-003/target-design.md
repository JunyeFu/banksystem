---
id: DOC-ARCH-RF003-TARGET
title: RF-003目标设计（版本来源统一，F09）
document_type: design
domain: architecture
status: PROPOSED
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003目标设计

## 1. 现状事实（代码级，2026-08-03）

| 源 | 位置 | 值 |
|---|---|---|
| MCP SDK 注册 | `mcp/src/server.cjs` L346 `new McpServer({name:'hengzhun-i10-regression', version:'8.0.0'})` | 8.0.0 |
| 健康接口 | `mcp/src/server.cjs` L1140 `/health` 响应 `version: '10.0.0'` | 10.0.0 |
| 运行时合同 | `contracts/mcp/hengzhun-i8.json` `contractVersion` | 10.1.0 |

RF-001-B2 versionPolicy（已冻结）：无单一旧字符串可作运行对齐证明；`contractVersionSource = active executable MCP contract`；`serverImplementationVersionSource = package metadata`；`healthVersionSource = release identity + executable contract hash`。

## 2. 单一变化轴

**版本单一来源**：运行时合同 `contractVersion`（`contracts/mcp/hengzhun-i8.json`）成为唯一权威版本；MCP SDK 注册版本与健康接口版本均从该权威派生并保持一致。不改变工具行为、不改变 ReleaseIdentity 输入（合同文件 hash 不属于身份输入——身份输入为 publication-manifest/agentflow/harness/worker/case-catalog；`contracts/mcp/hengzhun-i8.json` 变更不影响 identityHash，需在实施中验证）。

## 3. 目标状态（子项级）

### V1 SDK 注册版本统一
- 现状：`version: '8.0.0'`（硬编码）
- 目标：`version: <contractVersion>`（从合同 JSON 读取，启动时校验存在且为语义版本）
- 验证：合同测试断言 McpServer 构造版本 == contractVersion

### V2 健康接口版本统一
- 现状：`version: '10.0.0'`（硬编码）
- 目标：`version: <contractVersion>`（同一来源）
- 验证：`/health` 响应版本 == contractVersion（隔离运行态探测）

### V3 版本策略契约化
- 现状：versionPolicy 仅在 RF-001 边界合同（docs 侧）声明
- 目标：三源一致性断言机器化（rf003-version-contract 测试：合同 contractVersion == SDK 注册 == 健康响应）；边界合同 versionPolicy 引用更新
- 验证：`rf003-version-contract` 命令 exit 0

### V4 版本变更路径
- 现状：版本升级需要人工同步 3 处
- 目标：版本升级只改合同一处，其余派生（文档化在 contract-delta）
- 验证：变更合同 contractVersion → 重建/重启 → 三源一致（隔离运行态）

## 4. 模块所有者与边界

- 唯一改动模块：`hengzhun.mcp`（server.cjs 两处版本来源）+ `contracts/mcp/hengzhun-i8.json`（若需更新 contractVersion 语义注释，maxContractsChanged 1）
- 禁止：harness/flowise/worker/银行模块；工具名/别名/信封/状态契约改动；ReleaseIdentity 输入文件改动
- L2 衔接点：C1（新状态契约纳入版本管理——合同 contractVersion 即权威）、C5（三源断言成 RF-004/005 回归门禁）

## 5. 验证与门禁

- 全聚焦回归（RF-001/RF-002 56 项）+ rf003-version-contract + 校验器×3 + 身份/18链
- 生产切流（受管重启）与实时探测（/health 版本、工具调用正常）经用户批准后执行
- 完成指标：三源版本一致 = 1（终态指标"单一版本来源 1"达成）

## 6. 切片链建议

1. **RF-003-S1** 版本契约考古与基线（零代码：三源现状断言机器化，rf003-version-contract 测试骨架）
2. **RF-003-S2** 版本统一实现（server.cjs 两处派生 + 合同测试 + 隔离运行态探测）
3. **RF-003-S3** 生产切流、观察与批次关闭（受管重启 + /health 探测 + 身份/18链 + batch CLOSED）

## 7. 批准要求

本设计经用户批准后成为 RF-003 唯一变化轴授权。
