---
id: EVIDENCE-HENGZHUN-I9-P5-AGENTFLOW-20260721
title: 衡准I9 P5正式Agentflow发布与重启恢复证据
document_type: evidence
domain: platform
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 P5正式Agentflow发布与重启恢复证据

## 结论

P5已关闭。固定ID的“衡准自动化回归主控”已经Flowise公开API完成加密凭据注册、工作区导入、0问题校验、私有发布和工作区导出；停止四服务后从相同隔离双SQLite重启，Flow ID、发布状态、正式定义Hash和导出Hash均保持一致。

## 真实范围

- Flowise版本：3.0.12；Bundled Node：20.20.2；
- 公开API：`/api/v1/credentials`、`/api/v1/export-import/import`、`/api/v1/chatflows/{id}`、`/api/v1/validation/{id}`、`/api/v1/export-import/export`；
- MiMo凭据只由公开API加密写入Flowise平台SQLite，不输出值，不直接修改数据库；
- 正式Flow只允许输入、知识检索、结构化LLM、条件、循环、Human Input、MCP与直接回复语义；
- I8阶段2—7四份同源制品分别冻结SHA-256；
- 运行导出保存在忽略目录`.data/evidence/i9/`，不提交运行态数据库或秘密。

## 验证

```text
npm.cmd run verify:i9:stage5
3/3 passed
HENGZHUN_I9_STAGE5_PUBLICATION_CONTRACT_VERIFIED

npm.cmd run verify:i9:stage5:live
HENGZHUN_I9_STAGE5_PUBLIC_IMPORT_PUBLISH_EXPORT_RESTART_VERIFIED
```

本证据不证明用户自然语言正向链或失败修复反向链已在真实对话中完成，也不证明P8便携候选、P9最终提交文件夹或HiAgent迁移可用。
