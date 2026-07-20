---
id: EVIDENCE-HENGZHUN-I8-STAGE2-20260720
title: 衡准 I8 阶段2 Agentflow 与 MCP 本机集成证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-20
owner: 傅钧烨
---

# 衡准 I8 阶段2 Agentflow 与 MCP 本机集成证据

## 1. 结论

I8 开发顺序第2项已完成代码、制品和本机集成验证：普通用户入口只接收一句案例描述；Flowise Agentflow负责知识、结构化、最小澄清、人工确认和结果回显；平台外调用只经过带Bearer认证的MCP；Harness与SQLite持有案例、知识快照引用、验收摘要、IntentPlan和确认状态的权威事实。

本证据不证明Agentflow已在运行中Flowise发布，不证明真实MiMo对话成功，也不证明HiAgent目标环境已注册、可达或可运行。

## 2. 自动验证

执行`npm.cmd run verify:i8:stage2`，结果为`HENGZHUN_I8_STAGE2_AGENTFLOW_MCP_VERIFIED`，11项测试全部通过：

- 阶段1上下文与预算回归6项；
- migration 010及不可变交接状态；
- Harness准备、人工批准/拒绝、IntentPlan Hash和最小状态查询；
- 未澄清案例、疑似凭据/路径/代码/SQL输入的失败关闭；
- Flowise 3.0.12节点类真实加载及Agentflow禁止节点校验；
- MCP未认证请求拒绝；
- Flowise 3.0.12真实`MCPToolkit`发现14工具；
- `case_prepare`、`authoring_submit`、`authoring_get`真实调用MCP→Harness→SQLite；
- 其他11项后续工具稳定返回`I8_STAGE_CAPABILITY_NOT_AVAILABLE`。

## 3. 安全与迁移边界

- MCP只监听回环地址，Harness地址固定为回环HTTP，不接受用户提供任意URL。
- namespace、actor、幂等键、相关ID和Bearer由受控配置或MCP生成，不要求普通用户填写。
- 通用制品不包含Token、API Key、Flowise资源ID、Flowise/Harness运行数据库、会话或证据原文。
- Agentflow没有Code、HTTP、数据库、文件、Shell或浏览器节点；三个外部工具节点均为Custom MCP。
- Flowise与HiAgent逐节点映射制品明确`claimsHiAgentRuntimeVerified=false`。

## 4. 后续边界

阶段3从`AWAITING_STAGE3`权威状态开始实现有限DSL、确定性Script Package Builder、候选版本/Hash/来源追踪和Worker白名单执行。阶段2不得提前返回脚本成功、候选成功或稳定性证书。
