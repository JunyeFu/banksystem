---
id: DOC-ARCH-RF003-CONTRACT-DELTA
title: RF-003合同差异（版本来源统一，F09）
document_type: contract
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003合同差异

现状（三源漂移）：MCP SDK `8.0.0`（`mcp/src/server.cjs` L346 McpServer 构造）vs 健康接口 `10.0.0`（L1140 `/health`）vs 运行时合同 `10.1.0`（`contracts/mcp/hengzhun-i8.json` contractVersion）。

目标：单一版本来源——由冻结合同（`contracts/mcp/hengzhun-i8.json` contractVersion 或发布清单）派生，SDK 注册版本与健康接口版本与其一致；版本策略遵循 RF-001 B2 versionPolicy（无单一旧字符串可作运行对齐证明；合同版本源=可执行 MCP 合同）。

L2 衔接点 C1：RF-002 新状态契约（terminal/verificationGate）纳入统一版本管理；C5：三源一致性断言成为 RF-004/005 回归门禁。

## S1 基线（2026-08-03，rf003-s1-version-baseline.test.cjs 4/4）

| 源 | 现状 | 目标（V#） |
|---|---|---|
| MCP SDK 注册（server.cjs L346） | `8.0.0` | contractVersion 派生（V1） |
| 健康接口（server.cjs /health） | `10.0.0` | contractVersion 派生（V2） |
| 运行时合同（contracts/mcp/hengzhun-i8.json） | `10.1.0` | 唯一权威（V3 三源一致断言） |

安全性验证：`contracts/mcp/hengzhun-i8.json` 不在 `i10-release-identity.cjs` 输入清单中——版本统一不改变 ReleaseIdentity（身份测试 4/4 含 identityHash=632ad5ee）。
