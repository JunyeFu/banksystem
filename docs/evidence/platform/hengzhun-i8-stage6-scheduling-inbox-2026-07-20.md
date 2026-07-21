---
id: EVIDENCE-HENGZHUN-I8-STAGE6-20260720
title: 衡准 I8 阶段6精确版本调度与离线结果收件箱证据
document_type: evidence
domain: regression-platform
status: accepted
authority: informative
version: 1.0
effective_date: 2026-07-20
owner: 傅钧烨
---

# 衡准 I8 阶段6精确版本调度与离线结果收件箱证据

## 验收范围

- migration 014与历史调度安全回填；
- `RECURRING`五字段Cron和`ONE_TIME runAt`；
- `caseVersion + planId + scriptId + scriptVersion + scriptHash`精确绑定；
- 脚本当前版本漂移后旧调度不迁移；
- 一次性执行终态自动停用；
- 正式Run终态SQLite收件箱、分页、未读和确认已读；
- Flowise自然语言时间规范化/Human Input/MCP边界；
- MCP 11项ACTIVE、阶段7三项失败关闭；
- 固定Chromium纯Playwright调度执行。

## 实现证据

- `harness/migrations/014_i8_scheduling_inbox.sql`
- `harness/src/i8/stage6-schemas.ts`
- `harness/src/service.ts`
- `harness/src/server.ts`
- `mcp/src/server.cjs`
- `contracts/mcp/hengzhun-i8.json`
- `flowise/i8/stage6-scheduling-agentflow-v1.json`
- `tests/i8/stage6-scheduling-inbox.test.cjs`
- `scripts/verify-i8-stage6.ps1`
- `scripts/verify-i8-stage6-live.ps1`

## 已验证事实

1. 迁移后历史调度得到精确脚本身份；无法确定身份时自动禁用，未静默跟随最新脚本。
2. 新调度只接受已持证且明确激活的候选；技术版本、凭据别名和Fixture由MCP/Harness控制，不由普通用户填写。
3. 测试在创建ONE_TIME后新增脚本版本并更新`current_version`，调度任务仍携带创建时旧`scriptVersion`和旧`scriptHash`。
4. 固定产品Chromium通过纯Playwright实际完成登录、资料页姓名与头像一致性断言，并生成报告、截图和日志三类脱敏证据。
5. 同一一次性调度重复tick只创建一个Run；成功后调度为`DISABLED/SUCCEEDED`。
6. 同一Run只生成一个收件箱项；可未读查询和确认已读；不可删除触发器有效；输出未出现相对/绝对路径或凭据。
7. Flowise制品禁止Code、HTTP、数据库、文件、Shell、浏览器和任意URL节点；用户不写Cron，确认前不创建调度。

## 验证入口

```text
npm.cmd run verify:i8:stage6
npm.cmd run verify:i8:stage6:live
verify.cmd
```

## 证据边界

本证据证明Windows本机代码、SQLite迁移、Harness/MCP契约、Flowise可迁移定义和固定Chromium调度链。它不证明Flowise运行中Agentflow已发布、MiMo真实主控对话已完成，也不证明目标HiAgent服务器可访问MCP。阶段7反向诊断和修复工具仍未启用。
