---
id: EVIDENCE-HENGZHUN-I9-P4-MCP-20260721
title: 衡准I9 P4 MiMo与十四工具真实连通证据
document_type: evidence
domain: platform
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 P4 MiMo与十四工具真实连通证据

## 当前结论

P4已关闭。MiMo v2.5真实严格JSON调用与Bundled Flowise `MCPToolkit`的14项认证工具调用均已通过；本文可以作为I9 P4完成依据，但不得作为Agentflow已发布、正反向对话已通过或HiAgent已迁移的依据。

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

## MiMo真实适配器证据

`scripts/verify-i9-stage4-mimo.cjs`固定使用Flowise自带`@langchain/openai`的`ChatOpenAI`适配器、`mimo-v2.5`、JSON响应格式和进程环境变量引用执行结构化分类请求。执行结果是：

```text
HENGZHUN_I9_P4_MIMO_FLOWISE_ADAPTER_VERIFIED
HENGZHUN_I9_STAGE4_MIMO_AND_FOURTEEN_MCP_TOOLS_VERIFIED
```

真实验证通过。MiMo v2.5经Flowise自带`@langchain/openai`适配器及JSON响应格式返回精确`route=AUTHORING`、`riskLevel=LOW`结构；14项MCP工具、鉴权、幂等、16 KiB预算、确定性超时、安全错误、人工闸门与循环上限同时通过。运行时凭据只从忽略目录映射到进程，验证脚本不输出或保存值，并在结束时清除。P4可以关闭并进入P5；本证据不证明Agentflow已经导入、发布或重启恢复。
