---
id: DOC-ARCH-RF004-CONTRACT-DELTA
title: RF-004合同差异（执行凭据绑定，F08）
document_type: contract
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004合同差异

现状（RF-001 B2 决策 8 登记）：`run_submit`/`schedule_create` 由 MCP 注入 `credentialAlias: 'i3-customer'`（旧兼容行为，`until: B4 credentialRef consumer migration`——RF-001-B4 已过，迁移未执行）。

目标：正式执行凭据绑定权威化——case 权威 `credentialRef`（DPAPI 本机会话解析链）替代隐式 i3-customer；`HENGZHUN_RF004_LEGACY_CREDENTIAL=1` 兼容开关；`I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED` 新错误码入 matrix；边界合同 `until` 更新（13 别名计数不变）。

L2 衔接点 C2（RF-002-G4 `normalizeCredentialBinding` 断言将被 RF-004 更新）。
