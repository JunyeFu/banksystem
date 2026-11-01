---
id: BANKSYSTEM-RF046-CLI-RUNTIME-EVIDENCE-001
title: RF-046 CLI complete runtime evidence task package
document_type: task_package
domain: delivery
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-06
owner: Codex
---
# RF-046：CLI 完整运行证据验证

## 业务目标

测试工程师对一个已完成 Journey 执行证据验证，从 CLI 看到 DOM、截图、浏览器 trace、网络与账本五类证据均由 Harness 复核，且与同一 Run、Task 和 ReleaseIdentity 对齐。

## 输入与输出

- 输入：`hz-agent evidence verify <journeyId> --jsonl`。
- 输出：`hengzhun-cli-evidence-verification/v1`、精确权威 ID、五类覆盖、逐制品 SHA-256/大小复验和总判定。
- 状态源：Harness SQLite 与 Harness 制品库。

## 实现

- Worker 在正式 Playwright 执行中生成五类脱敏证据。
- Harness 从 Journey 精确解析 Run/Task，读取制品字节并与 SQLite 元数据复验。
- MCP 只读返回有界安全投影；CLI 不访问本地文件、SQLite、Harness HTTP 或浏览器。
- 任一缺失、篡改、跨身份或非终态结果以退出码 `5` 失败。

## 项目易错点

- 2026-09-08 实测：`查看账户概览页面中的账户列表区域` 被当作完整可见标签，导致已登录页面的定位校验失败。本批收尾允许修复 Worker 的该只读语义锚点；保留真实视觉定位与 Playwright 校验，禁止改变写操作定位规则。修复须通过行为回归，并以新身份、新 Journey 重验。

- 只有报告、日志与截图不构成完整证据。
- 截图存在不代表 DOM、trace 或网络已捕获。
- 只比对元数据字段不能证明制品字节未漂移。
- 不能把本地路径、下载令牌、请求头、请求体、Cookie 或输入值投影给 CLI。
- RF-046 不是 Full18、LIVE_E2E 或发布 GO。

## 验证

- STATIC：TypeScript 构建、文档与治理检查。
- CONTRACT：五类覆盖、投影模式、退出码与篡改/缺失/身份漂移失败。
- INTEGRATION：Fresh Harness 注册制品后逐字节复验并经真实 MCP 投影。
- RUNTIME_ACCEPTANCE：新身份下真实 BYOK author、精确 approve、一次 execute、同 Journey `evidence verify`。
- LIVE_E2E：不在本批执行。

## 冻结完成谓词

```text
command: hz-agent evidence verify <newJourneyId> --jsonl
before: releaseIdentity.identityHash=H; A05-M03-S02=IMPLEMENTING; Full18 ledger unchanged
pass: exit=0; verdict=VERIFIED; Journey terminal and Run=PASSED and Task=SUCCEEDED;
      evidenceKinds exactly include DOM,SCREENSHOT,TRACE,NETWORK,LEDGER;
      every registered artifact has sizeVerified=true and sha256Verified=true;
      releaseIdentityHash=H before and after; Full18 ledger unchanged
```

## 完成门

聚焦测试、注册测试、构建、治理和文档门通过；真实浏览器链只执行一次且 CLI 完成五类证据复验；服务安全停止。完成后 A05-M03-S02 进入 EVIDENCED、A05 进入 REVIEW，A06 仍需单独 LIVE 授权。
