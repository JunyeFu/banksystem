---
id: RF068-S5-LIVE-ROOT-CAUSE-20261024-03
title: RF068-S5 新身份LIVE认证步骤未展开根因
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-24
owner: Codex
---

# 认证未执行就查找账户导航

## 当前结论

登录按钮语义误拒已完成源码修复、正反例与复审；新身份已冻结并实际重跑S5。本次首先遇到不同的作者化/编译缺陷：模型把Keycloak认证概括为一个步骤，编译器没识别其认证语义，只将第一步编译为goto；浏览器停在登录页，下一步却查找门户账户列表导航。视觉模型正确报告目标不存在，首次确定性失败后验收停止，S5仍BLOCKED。

## 运行与报告

- H=`7a722b08a5fe79012a2d7fc4e1652fb9f1013a6362f499984d9de54a3c525239`，报告开始/结束/结束后inspect一致。
- 报告`agent/runs/rf068-s5/0d72ea26-3748-4bde-ae45-22ca91838f10/report.json`；北京时间2026-10-24 11:33:10至11:34:06。
- AUTHORITY、BROWSER_BOOTSTRAP、READ_ONLY_BANK_BASELINE、CREDENTIAL_REFERENCE、MISSING_INPUT通过；BYOK_READ_ONLY_EXECUTION在40349ms后FAILED，具体码`I10_MIDSCENE_TARGET_NOT_FOUND`。后续账户证据、历史切换/刷新、网页重启、银行after快照、模型配置/窄屏验收NOT_RUN。
- turn=`ab062afe-e154-4d32-aacf-841d3009f9d4`，Journey=`journey_e100d7cf-3e59-4acd-82b4-e19250728578`，job=`buildjob_e3600cfb-c96f-464c-a961-821d86e99dad`。
- Harness返回FAILED_ACTIONABLE/FAILED、AUTHORING错误，同一具体码到达turn及驱动；执行快照runs为空、runId/taskId为空，尚无正式Run。诊断attempt=1/maxAttempts=1，没有自动重试。
- Controller仍deepseek-v4-flash，视觉仍mimo-v2.6-flash；银行基线2个账户，摘要`d89b83251469c1369d3918b7905557533a762c9a7d0355fc66cc60d9a2044303`。after=NOT_RUN，不能宣称完整银行前后不变性通过。console errors/warnings均0。

## 已确认的因果链

1. 实际Journey caseDraft第一步为“使用已登记安全凭据完成 Keycloak 统一身份认证并进入复兴银行客户门户。”，expected为“认证完成并进入客户门户；不在输出中暴露任何凭据。”；caseDraft确有credentialRef，目标适配器绑定仍fuxing-bank-demo@2.0.0。
2. `harness/src/i8/script-package-builder.ts`的generic登录展开，loginSeedIndex同时要求凭据来源标记和文本命中`登录|login|sign in`。本次第一步的action/expected只说“身份认证/认证完成”，不含这些文本；该文本门确定不满足。因而已有认证模板没有展开成SSO点击、Keycloak用户名/密码填写、提交及等待认证完成。
3. 同一编译器将无operationHint的首步默认映射为goto。实际不可变plan的act_01因此保留“完成认证”的instruction，但operation只有goto。Worker实际执行只是打开`/portal/login`并记录ACTION_EXECUTED，不会替该goto隐式完成整段认证意图。
4. act_02=`act_02_f2bcce00e0d898a16f3c`的instruction为“从门户导航打开账户列表页面。”，被编译为click/DYNAMIC_002。诊断仍在`/portal/login`；SDK报告`.data/midscene-runs/report/playwright-2026-10-24_11-34-00-54591658.html`明确返回当前仅有登录/注册/帮助入口，没有账户列表导航，须先认证。报告控件摘要也确有“统一身份认证登录”，没有账户导航。
5. 所以本次TARGET_LOCATION失败符合页面事实，不是前一轮的“已选对登录按钮但误拒”。本plan没有SSO点击步骤，没有执行到本轮修复点；其61项隔离回归通过不能替代该点的银行LIVE验收。

原生脱敏诊断位于产品根`.data/evidence/i10/midscene-diagnostics/buildjob_e3600cfb-c96f-464c-a961-821d86e99dad.json`。另已只读核对实际plan：后续“只读核对”“不点击业务控件”“保持账户列表”也被降成click，此为尚未执行的编译语义缺口，不能描述为已发生业务点击或资金动作。

## 下一修复方向与停止边界

归属为Harness语义计划→可执行动作合同，而非继续放宽Worker定位规则。应让已登记认证绑定承担明确的认证前置能力，覆盖“身份认证/认证完成”等当前真实输入；未展开或无法表示的复合认证步骤不得被goto视为完成。只读观察、禁止行为和最终状态约束必须分别落为断言/约束，不得默认click。用本次实际draft补编译合同反例后，再做必要回归、复审、新身份冻结及从S5起点验收；不靠改提示强迫模型固定措辞或增加定位重试。

本轮按首错停止要求没有实施该后续修复、继续后续验收或再次LIVE。原银行服务/数据/卷/业务日期未改；Agent Harness110740、MCP99392、Worker72148保持owned/current/healthy，web111624 RUNNING，六种活跃聚合0，迁移44/44。正式28项、整体GO及S5完成均未提升。
