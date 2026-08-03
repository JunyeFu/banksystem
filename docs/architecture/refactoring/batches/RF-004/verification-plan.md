---
id: DOC-ARCH-RF004-VERIFICATION
title: RF-004验证计划
document_type: verification
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004验证计划

基线验证（已满足）：全聚焦 62/62、校验器×3（batches=5 待 RF-004 落盘后）、ReleaseIdentity `632ad5ee`、18 链 18/18。

实施验证（target-design 批准后按切片补充）：
- rf004-credential-binding：绑定解析三分支（credentialRef 解析/缺失失败关闭/LEGACY 回退）+ 无凭据泄漏
- Harness enqueueRun credentialRef 写入断言（隔离运行态）
- 生产切流探测（真实案例执行链 + 失败关闭）
