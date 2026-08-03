---
id: EVIDENCE-HENGZHUN-I9-P6-FORWARD-20260721
title: 衡准I9 P6真实正向Flowise对话证据
document_type: evidence
domain: platform
status: accepted
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
---

# 衡准I9 P6真实正向Flowise对话证据

## 结论

P6已关闭。普通用户只输入“验证客户在门户登录后，页眉姓名和头像与个人资料保持一致”，正式Flowise Agentflow随后在同一会话完成案例结构化、知识引用、人工确认、确定性Playwright候选构建、固定Chromium桌面与窄屏各3次签证、脚本预览、显式激活、用户选择按需运行及终态结果回复。

## 真实链路

- 首次预测停在案例摘要人工确认，不要求用户提供技术ID、定位器、凭据别名、Cron或提示工程指令；
- 确认后由MCP写入Harness事实，MiMo只生成扁平业务意图字段，MCP重建严格IntentPlan；
- 本地Worker领取确定性Builder任务，以真实复兴银行门户执行浏览器事实探测，并对生成候选完成2视口×3次纯Playwright签证；
- Flowise查询Harness权威状态并展示分页脚本预览，用户另行确认后才激活；
- 激活不自动执行，第二次人工确认后才创建按需任务；
- Worker使用固定Chromium和纯Playwright运行已激活精确版本，Flowise等待任务终态并回复`SUCCEEDED/PASSED`；
- 运行原始响应只保存在忽略目录`.data/evidence/i9/`，证据文档不保存凭据、Cookie、绝对路径或未脱敏Artifact正文。

## 验证

```text
npm.cmd run verify:i9:stage6
3/3 passed
HENGZHUN_I9_STAGE6_FORWARD_FLOW_CONTRACT_VERIFIED

npm.cmd run verify:i9:stage6:live
20个执行节点完成
FORWARD_FLOW_VERIFIED
HENGZHUN_I9_STAGE6_FLOWISE_FORWARD_CONVERSATION_VERIFIED
```

本证据只关闭P6正向对话，不证明P7反向事故恢复、P8跨电脑便携验收、P9最终提交文件夹或HiAgent环境可用。
