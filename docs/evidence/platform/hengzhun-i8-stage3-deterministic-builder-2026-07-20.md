---
id: EVIDENCE-HENGZHUN-I8-STAGE3-DETERMINISTIC-BUILDER-20260720
title: 衡准 I8 阶段3确定性Builder本机验证证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-20
owner: 傅钧烨
---

# 衡准 I8 阶段3确定性Builder本机验证证据

## 验证对象

- migration 011与不可变来源链；
- 严格`ExecutableActionPlan`、10操作有限DSL和三类定位器；
- 确定性Script Package Builder与候选版本、Hash、来源追踪；
- Worker候选目录、manifest、脚本Hash和能力白名单；
- 第4项活跃MCP工具`candidate_get`及Flowise MCP Client到Harness/SQLite的真实本机调用。

## 结果

- `npm.cmd run verify:i3:openapi`：通过；公开Harness 14项、内部Worker 9项、作者化相关5项操作均满足契约门禁。
- `npm.cmd run verify:i8:stage3`：15/15通过，其中阶段1为6项、阶段2为5项、阶段3为4项。
- 相同规范化输入生成字节一致候选及相同Hash；未知DSL、未知定位器和越权目标被拒绝。
- 候选经SQLite与受控`.data`目录落地；Worker在执行前复核manifest/脚本Hash，篡改后拒绝执行。
- Flowise 3.0.12真实`MCPToolkit`可调用`candidate_get`；MCP自行查询并注入受控准备版本，不将技术并发参数暴露给用户。

## 证据边界

- Worker测试使用受控Fake Page验证Playwright调用契约，没有运行真实Chromium。
- 未运行两个视口各连续3次，未生成`StabilityCertificate`。
- 未发布运行中Flowise Agentflow，未执行真实MiMo主控/视觉对话，未在HiAgent注册或验收。
- 候选状态仅为`GENERATED`，未激活、未调度、未用于正式回归。
- `PROFILE_AVATAR`当前映射依赖`data-testid=profile-avatar`；真实门户是否稳定提供该标记必须由阶段4浏览器验证确认。

因此本证据只支持“I8阶段3代码与本机集成验证完成”，不支持“完整自动化回归闭环完成”或“HiAgent迁移完成”。
