---
id: RF068-S5-LIVE-ROOT-CAUSE-20261024-02
title: RF068-S5 新身份首次LIVE语义定位误拒根因
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-24
owner: Codex
---

# 新身份首次LIVE：正确按钮被语义匹配误拒

## 结论

新身份已冻结并启动，完整S5在候选作者化的第二个动作首次确定性失败，随后停止。视觉模型正确选择了统一身份认证按钮；Worker将含动词及“入口”描述的整句当作必须出现在按钮上的字面文字，误拒该按钮。本次不再是模型不支持或错误码丢失。

## 冻结与运行凭据

- ReleaseIdentity：`618b078b7b3ca43f0d3ae4b7c658faa95c94d4c9e0ab1b1bf1b8f20ec193c129`，验收前后相同。
- 原托管入口启动成功，回执为产品根`.data/rf068-s5/b771d155-f8a3-4c33-918c-43564503c27b`。
- 原SQLite一致性备份`.data/sqlite/offline-backups/rf068-s5-9af9c76d-5dff-4a77-b3a9-708dfcb19c32.sqlite`，SHA256=`e9ed3ca56bc6632801e93f6f23c2026ad2eebd59e3aff9f37a30025138fa1962`。
- Harness PID59976、MCP75084、Worker95596均owned/current/healthy；Agent web65032为RUNNING。迁移44/44，结束时六种活跃聚合均0。原银行容器持续运行，Gateway健康GET200；没有重建/停止/修改银行服务、卷或业务日期。
- 用户重新下达冻结/重验指令后，本次同一托管入口获准执行，未修改全局配置/工具规则或换渠道绕过先前拒绝。先前blocked by policy保留为历史事件，具体规则仍未知，当前已非阻塞点。

## LIVE实际结果

报告：`agent/runs/rf068-s5/ae132adb-4036-4130-9cd6-b263029bc797/report.json`，北京时间2026-10-24 11:20:52至11:21:52。正式入口为`verify-agent-workbench.ps1 -Scope LiveReadOnly`，进程非零退出，报告FAILED。

| 阶段 | 结果/耗时 |
| --- | --- |
| AUTHORITY | PASSED，4010ms |
| BROWSER_BOOTSTRAP | PASSED，15602ms，含真实模型/视觉就绪检查 |
| READ_ONLY_BANK_BASELINE | PASSED，3090ms，2个账户 |
| CREDENTIAL_REFERENCE | PASSED，606ms，秘密仅在既有登记边界消费 |
| MISSING_INPUT | PASSED，644ms |
| BYOK_READ_ONLY_EXECUTION | FAILED，35856ms，I10_MIDSCENE_LOCATOR_MISMATCH |
| 后续账户证据/历史刷新/网页重启/前后快照/模型菜单窄屏 | NOT_RUN，首错停止 |

turn=`4b901e3b-91c9-4fd2-be35-355d8a71007c`，Journey=`journey_7dc48b28-4289-4dfd-8923-93ecd409cf16`，job=`buildjob_096496db-3e18-4af2-8631-037518524040`。Controller模型为deepseek-v4-flash，视觉为mimo-v2.6-flash。Harness返回FAILED_ACTIONABLE/FAILED及AUTHORING错误；同一具体码已到达turn和验收驱动，未再折叠为JOURNEY_EXECUTION_FAILED。精确executionSnapshot的runs为空、turn的runId/taskId为空，尚无正式Run。

## 根因证据链

1. 本job脱敏诊断位于产品根`.data/evidence/i10/midscene-diagnostics/buildjob_096496db-3e18-4af2-8631-037518524040.json`。动作1 goto在`/portal/login`完成。动作2为`act_02_e99f22e0fbb8680d1097`、DYNAMIC_002、click；原不可变plan的instruction为“点击统一身份认证入口”。
2. 动作2只定位一次：attempt=1/maxAttempts=1，模型返回图像坐标[230,204]，派生定位器kind=TEST_ID；本次诊断中的derivedLocatorHash与规范化`{kind:'TEST_ID',value:'login-sso-submit'}`摘要完全一致。这证明视觉选择的是实际SSO按钮，不是周边卡片或其他入口。
3. 当前客户门户Login.tsx的该按钮文字为“统一身份认证登录”。同次页面在验收驱动自己的基线登录中工作正常。
4. 当前Worker的genericActionTerms对实际动作返回`['点击统一身份认证入口']`，genericEvidenceMatchesTerms要求候选文字包含该整句。对实际按钮文字进行现有函数的只读回放，结果false；其中“点击”未剥离，且“入口”是意图描述而非页面标签。
5. genericLocatorMatchesAction据此返回false，Worker在TARGET_VALIDATION终止，错误为I10_MIDSCENE_LOCATOR_MISMATCH。尚未对该按钮执行Playwright click，因此Worker未进入Keycloak或填写凭据。

根因归属：Worker通用动作语义→可见标签的匹配规则过于字面化。视觉接口与模型请求本次已成功，首错停止及MCP具体错误传播已在真实执行中生效。没有证据支持再次修改视觉端点、提高重试次数或修改银行登录页。

## 证据局限及修复方向

银行before摘要为`d89b83251469c1369d3918b7905557533a762c9a7d0355fc66cc60d9a2044303`，after为NOT_RUN，不能声称银行前后不变性完整通过。浏览器console错误/警告均0。失败截图在前端轮询收敛前采集，仍显示RUNNING；它不能证明实机终态UI已通过，也不能据此断言持久的UI刷新缺陷，终态以已确认的turn/API为准。

后续最小修复应把动作动词、业务意图和可见目标标签区分开；对已登记的SSO认证语义使用受限、可验证的匹配，不删除可点击性、真实DOM或目标一致性核验。增加本次准确命中SSO按钮的正例及注册/其他按钮的反例，再回归、复审并冻结新身份，从S5起点重新验收。此次仅记录方向，没有修改产品源码或自动重跑；本失败报告保持FAILED，S5仍BLOCKED，正式28项及整体GO不提升。
