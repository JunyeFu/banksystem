---
id: EVIDENCE-HENGZHUN-I9-P4-MCP-20260721
title: 衡准I9 P4十四工具连通与MiMo待验收证据
document_type: evidence
domain: platform
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 P4十四工具连通与MiMo待验收证据

## 当前结论

P4尚未关闭。工具侧已通过，模型侧因本机没有进程可用的`MIMO_API_KEY`而缺少真实请求证据。本文不得作为MiMo已连通或P4已完成的依据。

## 已通过范围

Bundled Flowise 3.0.12内的真实`MCPToolkit`经Bearer Streamable HTTP发现并调用以下14项工具：

`case_prepare`、`authoring_submit`、`authoring_get`、`candidate_get`、`candidate_preview`、`candidate_decide`、`run_submit`、`task_get`、`schedule_create`、`schedule_get`、`result_inbox_list`、`failure_get`、`repair_propose`、`decision_submit`。

成功链实际经过Harness与隔离SQLite，覆盖案例准备、人工批准后的作者化、确定性候选、持证预览、显式激活、按需任务、一次性调度、离线收件箱、受控失败、修复提案和显式拒绝。测试同时验证：

- 无Bearer请求返回401；
- 相同会话与业务载荷保持幂等；
- 每项工具响应不超过16 KiB且不含测试根路径或Token；
- 100 ms测试超时转换为`HARNESS_REQUEST_TIMEOUT`，不抛出内部异常；
- 未知事故以确定性安全错误传播；
- Flowise定义包含Human Input，澄清循环上限为2，外部能力只允许MCP；
- 控制配置冻结主控1M窗口和视觉16K窗口。

```text
npm.cmd run test:i9:stage4
3/3 passed
```

## 尚缺证据

`scripts/verify-i9-stage4-mimo.cjs`已固定使用Flowise自带`@langchain/openai`的`ChatOpenAI`适配器、`mimo-v2.5`和环境变量引用执行结构化分类请求。当前执行结果是：

```text
I9_P4_MIMO_CREDENTIAL_REQUIRED
```

需要在当前PowerShell进程安全设置`MIMO_API_KEY`后运行`npm.cmd run verify:i9:stage4`。该命令必须输出`HENGZHUN_I9_P4_MIMO_FLOWISE_ADAPTER_VERIFIED`，且不得输出或保存密钥，才允许关闭P4并进入P5。
