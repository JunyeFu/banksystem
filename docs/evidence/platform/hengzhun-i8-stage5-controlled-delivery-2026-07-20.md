---
id: EVIDENCE-HENGZHUN-I8-STAGE5-20260720
title: 衡准I8阶段5受控交付与按需执行证据
document_type: evidence
domain: regression-platform
status: accepted
authority: informative
version: 1.0
effective_date: 2026-07-20
owner: 傅钧烨
---

# I8阶段5验收结论

阶段5本机实现和真实门户验收通过。该结论只覆盖持证脚本交付、人工决策、精确激活和按需纯Playwright执行，不覆盖阶段6调度/离线收件箱、真实Flowise Agentflow发布、真实MiMo主控或HiAgent目标环境。

## 实现证据

- SQLite migration 013：不可变交付决策、短时一次性下载授权及终态保护。
- Harness：`candidate_preview`、`candidate_decide`、`run_submit`、`task_get`；证书与双Hash复核、完整行分页、精确并发版本。
- Worker：受控候选描述符、固定Chromium、空BrowserContext、来源白名单和纯Playwright正式执行。
- MCP 5.0.0：14项冻结工具中8项ACTIVE、6项后续阶段失败关闭。
- Flowise制品：阶段5续办流只使用MCP、条件、人工确认、结构化LLM和直接回复，用户无需输入技术引用。

## 自动验证

执行`npm.cmd run verify:i8:stage5`：阶段1—5累计25项测试全部通过，内部OpenAPI静态门禁通过。覆盖未持证拒绝、Hash复核、分页、一次性下载、SAVE_ONLY/ACTIVATE/REJECT、旧版本冲突、激活不创建Run/Schedule、按需执行和任务查询。

## 真实门户验证

执行`npm.cmd run verify:i8:stage5:live`，固定内置Chromium对当前本机复兴银行门户完成：

1. 两个固定视口各3次，共6次独立稳定性验证并签发证书；
2. 持证脚本预览与脚本Hash一致；
3. 用户语义等价的ACTIVATE绑定精确脚本版本，未自动调度；
4. 另行提交一次按需任务；
5. 纯Playwright正式复跑通过，任务终态为`SUCCEEDED/PASSED`。

运行摘要保存在忽略目录`.data/evidence/i8-stage5-live-summary.json`；证据只含ID、Hash、状态和本机服务Origin，不含凭据、Cookie、storage state、绝对路径或未脱敏正文。

## 残余边界

- Flowise续办制品尚未在真实Flowise UI导入和发布。
- MiMo主控对话与HiAgent同源迁移尚未验收。
- 阶段6才实现精确版本周期/一次性调度和离线结果收件箱。
