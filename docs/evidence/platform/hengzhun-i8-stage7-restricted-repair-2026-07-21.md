---
id: EVIDENCE-HENGZHUN-I8-STAGE7-20260721
title: 衡准I8阶段7限域修复闭环验证证据
document_type: evidence
domain: regression-platform
status: accepted
authority: informative
version: 1.0
effective_date: 2026-07-21
owner: 傅钧烨
---

# 衡准 I8 阶段7限域修复闭环验证证据

日期：2026-07-21

## 1. 验证范围

本证据只覆盖 `D:\Agent\banksystem\platform\hengzhun-regression-system` 内的阶段7本机实现：SQLite migration 015、Harness失败分类与上下文、受限修复提案、Worker六次稳定性门禁、MCP 7.0.0、Flowise同源制品及修复版本向按需运行/新调度的交接。

它不证明真实 Flowise Agentflow 已发布，不证明 MiMo 主控对话已完成，也不证明 HiAgent 目标环境可访问本机工具。

## 2. 已验证事实

- 十一类失败由确定性分类器冻结，不接受LLM自由分类。
- 正式失败创建脱敏CTX-L1；第一次和第二次修复稳定性失败分别生成最小CTX-L2、CTX-L3，相邻摘要不含绝对路径或凭据。
- `ScriptPatchProposal`拒绝源码、未知字段、任意选择器和断言弱化，只接受冻结的五类操作。
- 每个尝试生成不同候选ID、脚本版本、脚本Hash、Manifest Hash和来源链；最多3次，第四次返回`I8_REPAIR_ATTEMPT_LIMIT_EXHAUSTED`并将事故标为`UNRESOLVED`。
- 每个修复候选重新建立两个视口各3次的批次；失败不发证，六次全部通过且断言/证据集合一致才发证。
- 持证候选仍需用户显式`ACTIVATE`；激活不自动运行，也不自动迁移既有调度。
- 用户后续显式提交按需运行或新建调度时，Harness选择已激活修复版本并复核精确计划、版本和Hash。
- MCP契约版本为7.0.0，14项工具全部ACTIVE，但没有任意文件、Shell、浏览器、数据库或URL能力。

## 3. 自动化结果

- `npm.cmd run test:i8:stage7`：3/3通过。
- 阶段7第三项测试贯通：初始正式失败、L1、两次失败升级到L2/L3、第三候选六次签证、人工激活、修复版本按需运行、新建一次性调度精确绑定。
- `npm.cmd run verify:i8:stage7`：阶段1—7累计32/32通过；内部OpenAPI 14个公开操作、11个Worker操作及通道隔离校验通过。
- `npm.cmd run verify:i8:stage7:live`：目标阶段7场景1/1通过，固定Chromium完成修复候选两个视口各3次，共6次真实纯Playwright验证，输出`HENGZHUN_I8_STAGE7_REAL_CHROMIUM_SIX_RUN_REPAIR_VERIFIED`。
- 文档校验、`git diff --check` 和全量 `verify.cmd` 的最终结果以本次提交前实际命令为准；若后续门禁失败，不得改写为通过。

## 4. 真实浏览器边界

阶段4已经留存固定Chromium对合成门户和真实复兴银行门户的六次通过证据，阶段5/6也分别留存正式复跑与调度执行证据。这些历史证据不能替代阶段7修复候选的本次真实浏览器复验。

阶段7 live专项首次尝试曾在固定Chromium访问本机回环门户时遇到Windows网络缓冲耗尽：`net::ERR_NO_BUFFER_SPACE`。该次失败没有被计为产品通过，也没有用合成回传冒充真实Chromium。网络恢复后重新执行，同一专项已完成6/6并通过；前一次环境故障仍保留为运行风险，不影响事实边界。

## 5. 安全与残余风险

- 证据不记录账号、密码、Token、Cookie、Storage State、绝对Artifact路径或未脱敏页面内容。
- Flowise/MiMo/HiAgent仍是外部运行门禁；本机代码通过不能关闭I8总任务。
- 已有Schedule继续冻结旧版本，只有用户明确创建新调度或未来执行受控迁移操作才会使用修复版本。
