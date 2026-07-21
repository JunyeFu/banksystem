---
id: EVIDENCE-HENGZHUN-I9-QWEN35-COMPAT-20260721
title: 衡准I9 MiMo受Qwen3.5能力上限约束的验证证据
document_type: evidence
domain: platform
status: verified
authority: informative
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 MiMo受Qwen3.5能力上限约束的验证证据

## 决策增量

- 影响控制：`HZ-C17`、`HZ-C18`、`AUD-011`、`AUD-054`。
- 变更：主控从旧1M窗口收紧为与视觉模型相同的16K总窗口；MiMo v2.5只允许使用Qwen3.5已确认能力交集。
- 顺序：不新增I9阶段，作为继续P7前的兼容门禁。
- 外部条件：这里只证明当前MiMo请求和本机制品符合兼容上限，不冒充目标HiAgent租户已经接入Qwen3.5。

## 冻结的兼容上限

- 主控和视觉：总窗口16,000 tokens，输入最多12,000，输出保留4,000。
- 报文：OpenAI兼容Chat Completions，角色仅`system/user/assistant`，内容仅字符串。
- 结构化输出：非思考、非流式`response_format={"type":"json_object"}`；每个系统提示包含JSON关键词；输出必须通过本地Schema校验。
- 单节点最大输出4,000 tokens、超时60秒、最多三次总尝试。
- 禁止模型原生工具、并行工具、`reasoning_content`、developer角色、多模态消息；MCP只由Workflow节点调用。
- 机器可读契约：`flowise/i9/qwen35-capability-envelope-v1.json`。

## 官方依据

- Qwen OpenAI兼容Chat Completions报文与`response_format`：[Alibaba Cloud Model Studio](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions)。
- Qwen3.5开源系列非思考模式支持JSON mode，且提示必须包含JSON：[Structured output](https://help.aliyun.com/en/model-studio/qwen-structured-output)。
- 输入超过预算时从旧轮次和旧工具结果开始折叠/删除，并保留当前请求：[Qwen-Agent Context Management](https://qwenlm.github.io/Qwen-Agent/en/guide/core_moduls/context/)。

## 验证结果

2026-07-21在`platform/hengzhun-regression-system`执行：

- `npm.cmd run test:i8:stage1`：9/9通过，主控与视觉16K预算均按确定性错误码失败关闭。
- `npm.cmd run test:i9:stage4`：3/3通过，逐节点检查消息角色、字符串内容、JSON提示、4K输出、非流式、非推理、禁用strict tool calling和14项MCP边界。
- `npm.cmd run test:i9:stage5`：3/3通过，发布制品Hash与节点语义有效。
- `npm.cmd run test:i9:stage6`：3/3通过，既有正向Flowise链未被兼容收紧破坏。
- `npm.cmd run verify:i9:stage4`：真实MiMo v2.5结构化请求通过，提供方返回usage，凭据未持久化；14项MCP工具验证通过。

## 边界

- 当前未在目标HiAgent租户运行Qwen3.5，因此不能声明Qwen3.5或HiAgent真实E2E已通过。
- MiMo提供方即使支持更大窗口、思考或扩展报文，本产品也不得启用。
- 未来换Qwen3.5只允许替换模型名、基础地址和凭据；如果需要改变Workflow语义，必须重新审计而不是视为无缝迁移。
