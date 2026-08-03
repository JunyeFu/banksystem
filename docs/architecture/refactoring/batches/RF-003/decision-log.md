---
id: DOC-ARCH-RF003-DECISIONS
title: RF-003决策记录
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003决策记录

1. 2026-08-03：用户指示推送 RF-002 后切换 RF-003 分支；RF-002 已推送 `github/RF-002`（`ba41e20`）。
2. RF-003 分支自 RF-002 创建；批次骨架落盘（batch.yaml PROPOSED + 9 制品）；L1 全景 RF-003 解禁登记已生效。
3. **范围未细化声明**：target-design v1.0 为草案（V1-V4 子项），经用户批准前不构成实施授权（RC-D0）。

2. 2026-08-03（S1完成）：版本契约考古与基线。用户批准 target-design v1.0 后执行 S1：三源漂移现状机器断言（SDK 8.0.0/健康 10.0.0/合同 10.1.0，S2 反转锚点）；B2 versionPolicy 冻结断言；**身份安全性验证**（contracts/mcp/hengzhun-i8.json 不在身份输入清单）；rf003-s1-version-baseline.test.cjs 4/4、全聚焦 60/60、校验器×3、身份 632ad5ee、git diff --check 全过；零运行时代码改动。**RC-D1同步链**：任务包→切片→contract-delta（差异表）→batch→L2（C1/C5 保持）；无顶层冲突。下一门禁 S2（版本统一实现）。

3. 2026-08-03（S2完成）：版本统一实现。server.cjs 新增 runtimeContractVersion（从 contracts/mcp/hengzhun-i8.json contractVersion 派生，启动校验语义版本格式失败关闭 HENGZHUN_CONTRACT_VERSION_INVALID）；McpServer 注册版本与 /health 响应版本均同源（替换硬编码 8.0.0/10.0.0）；合同零变更（10.1.0 为唯一权威）。S1 锚点翻转（三源互异→三源一致）；rf003-s2-version-unify.test.cjs 2/2（静态+隔离运行态 /health 探测+工具调用正常）；全聚焦 62/62、校验器×3、身份 632ad5ee、git diff --check 全过。**RC-D1同步链**：任务包→切片→contract-delta（V1/V2/V3 已实现）→L2 C5（三源断言成 RF-004/005 回归门禁）→batch；无顶层冲突。下一门禁 S3（生产切流关闭）。
