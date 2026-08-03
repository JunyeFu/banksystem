---
id: DOC-ARCH-RF003-VERIFICATION
title: RF-003验证计划
document_type: verification
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003验证计划

基线验证（已满足）：全聚焦 56/56、校验器×3（batches=4 待 RF-003 落盘后）、ReleaseIdentity `632ad5ee`、18 链 18/18。

实施验证（target-design 批准后按切片补充）：
- rf003-version-contract：三源一致性断言（合同 contractVersion == SDK 注册 == 健康响应）
- 全聚焦回归 + 隔离运行态探测 + 生产切流探测（/health 版本）
