---
id: EVIDENCE-HENGZHUN-I9-P3-20260721
title: 衡准I9 P3平台资源与双SQLite验收证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 P3平台资源与双SQLite验收证据

## 验收结论

I9 P3通过。Flowise平台知识、MiMo参数、MCP参数和运行时秘密变量名能够从仓库制品经Flowise公开API首次导入并幂等复核；Harness只保存不可变知识快照引用。Flowise与Harness SQLite保持物理隔离，可分别备份、恢复并验证职责边界。

本结论不证明MiMo模型或十四项MCP工具已经真实连通，不证明Agentflow已发布，也不证明I9产品全部可用；这些分别属于P4及后续阶段。

## 已验证链路

1. 隔离数据根启动Harness、MCP、Worker和Flowise，未复用或覆盖正式Flowise账户与数据库。
2. 通过`/api/v1/account/register`、`/api/v1/auth/login`和公开导入接口建立平台资源，不直接写Flowise内部表。
3. 从Flowise知识查询接口按固定资源ID回读正文，复核来源版本、SHA-256和三个引用ID。
4. 相同制品再次初始化时不重复写入，并对变量类型和值漂移失败关闭。
5. Harness受认证入口登记`KnowledgeSnapshotRef`；migration 016禁止修改和删除，表结构没有正文列。
6. 服务停止后，SQLite备份API分别生成Flowise与Harness备份；恢复前复核清单Hash和角色，恢复后执行`quick_check`及双向禁表检查。

## 自动验证

```text
npm.cmd run verify:i9:stage3
4/4 passed
HENGZHUN_I9_STAGE3_PLATFORM_RESOURCE_CONTRACT_VERIFIED

npm.cmd run verify:i9:stage3:live
HENGZHUN_I9_STAGE3_PUBLIC_API_AND_DUAL_SQLITE_LIVE_VERIFIED
```

真实验证使用随机合成测试凭据，只存在于进程环境；测试结束后四服务停止并删除隔离运行数据。仓库、输出和证据中不保存凭据值。

## 关键制品

- `flowise/i9/platform-resource-manifest-v1.json`
- `flowise/i9/connection-profiles-v1.json`
- `flowise/i9/knowledge/portal-login-consistency-v1.md`
- `scripts/i9-platform-bootstrap.cjs`
- `scripts/i9-sqlite-snapshot.cjs`
- `harness/migrations/016_i9_platform_knowledge_refs.sql`
- `tests/i9/stage3-platform-resources.test.cjs`

## 后续门禁

下一阶段是P4。只有注入本机私有MiMo凭据引用并对十四项认证MCP工具逐项留下真实调用、超时、输出预算、人工续办和错误传播证据后，才能关闭`AUD-048`。
