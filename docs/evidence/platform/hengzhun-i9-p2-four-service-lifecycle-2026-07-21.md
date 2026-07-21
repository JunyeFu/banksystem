---
id: EVIDENCE-HENGZHUN-I9-P2-FOUR-SERVICE-LIFECYCLE-20260721
title: 衡准 I9 P2 四服务便携启停与健康门禁证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
date: 2026-07-21
---

# 衡准 I9 P2 四服务便携启停与健康门禁证据

## 结论

I9 P2已通过。Windows原生Harness、MCP、Worker、Flowise可由产品自有命令统一准备、启动、检查和停止；验收结束后四服务均已停止。该结论不证明P3平台知识/模型/MCP配置、P5 Agentflow发布或HiAgent验收。

## 已实现入口

- `npm.cmd run prepare:i9`
- `npm.cmd run start:i9`
- `npm.cmd run status:i9`
- `npm.cmd run stop:i9`
- `npm.cmd run verify:i9:stage2`
- `npm.cmd run verify:i9:stage2:live`

启动顺序固定为Harness → MCP → Worker → Flowise；停止顺序固定为Flowise → Worker → MCP → Harness。所有入口使用Bundled Node，运行态只写`.data/`。

## 安全与故障门禁

- 三类Token只由环境变量注入，缺失或弱值在启动任何进程前失败关闭。
- PID状态不含Token、API Key或账号密码。
- 每个PID通过Windows进程可执行文件、产品绝对入口和命令行标记共同验明归属。
- 未知进程占用正式端口时返回`I9_PORT_OCCUPIED_UNKNOWN`，占用进程保持存活。
- 注入Worker启动失败后，本轮已启动Harness/MCP自动清理，PID状态文件删除，端口恢复可用。
- 真实运行发现并修复两条I8修复稳定性Worker路由遗漏内部通道鉴权的问题。
- 历史Docker容器`hengzhun-harness`经Compose标签确认属于本产品后仅停止、未删除；正式P2不依赖Docker。

## 真实运行结果

- 四服务状态：全部`owned=true`、`healthy=true`。
- Flowise URL：`http://127.0.0.1:3006`。
- 重复启动：返回`ALREADY_RUNNING`且PID不变。
- Harness SQLite：`quick_check=ok`。
- Flowise SQLite：`quick_check=ok`。
- 完整停止后重新启动：四服务再次全部健康，两套SQLite再次`quick_check=ok`。
- 停止后状态：`NOT_RUNNING`。

## 自动验证

- P2契约测试：`3/3`通过。
- 产品总门禁I1— I8、I9 P1—P2通过；I8累计`32/32`通过。
- 真实生命周期终态：`HENGZHUN_I9_STAGE2_FOUR_SERVICE_LIFECYCLE_VERIFIED`。
- 产品总门禁终态：`HENGZHUN_I1_I2_I3_I4_I5_I6_I7_I8_STAGE7_I9_STAGE1_AND_STAGE2_VERIFIED`。

## 下一步

进入I9 P3，只通过Flowise公开支持的界面、导入或正式API初始化平台SQLite、平台知识、模型和MCP连接；禁止直接修改Flowise内部数据库。
