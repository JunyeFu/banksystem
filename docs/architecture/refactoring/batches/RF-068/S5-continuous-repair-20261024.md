---
id: RF068-S5-CONTINUOUS-REPAIR-20261024
title: RF068-S5 连续定位修复与复测回执
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-24
owner: Codex
---

# S5 连续修复

用户最新授权：失败后定位、修复、回归并重新测试，至少完成5个独立错误后统一汇报。单次失败证据仍封存，源码变化后新身份从起点验证；不是在产品内吞错或隐藏重试。原银行服务、数据、卷和日期不动。

## 发现与修复结果

| 编号 | 独立错误与证据 | 最小修复 | 对应验证 |
|---|---|---|---|
| C01 | 已失败LIVE的凭据步骤说“统一身份认证”，未命中登录展开，只执行goto | 凭据来源门保留，识别明确身份认证语义，消费已登记SSO协议 | rf057-pkce新增无“登录”关键字的真实draft反例 |
| C02 | “在账户列表中只读核对…”编成click，误找交互控件 | 位置/只读修饰后的核对归expectVisible | target-profile的S5只读位置反例，显式点击正例保持click |
| C03 | “不点击转账…”因点击关键字反向生成click | 禁止子句收为不变量；纯只读约束不产执行动作，混合指令保留正向动作 | 同套件纯禁止、混合点击查询/禁止转账两种合同 |
| C04 | “保持账户列表，不进入历史门户”被编成导航点击 | 保持页面转为当前页面可见断言；禁止进入另作不变量 | 同套件保持/禁止导航反例 |
| C05 | 泛化首步强制goto，把第一个业务断言静默覆盖 | 必要时独立前置入口goto，原业务断言保留 | 同套件首个余额断言反例，与C01独立：无认证步骤/凭据/绑定也复现 |
| C06 | Worker把“从门户导航打开账户列表页面”提取为“打开账户列表”，与实际导航“账户”不匹配 | 去导航上下文；单目标导航只去展示后缀，多目标分支维持原合同 | generic-worker-routing新增导航正反例；原多目标导航回归 |
| C07 | Worker把“在账户列表中只读核对”当成字面DOM文字；并列事实又被当单个字段 | 仅只读观察去位置/只读修饰；单字段解析不吞并列符号 | 同套件位置修饰正反例，点击操作不应用该规范化 |

C01–C05在修复前43项套件中独立失败5项，38项原回归通过；C06–C07在Worker针对性运行中独立失败2项。不是按同一错误的日志数量凑数。C02–C04虽出现在上一份未执行到的不可变plan中，仍只记编译反例，不记真实业务误点击。

源码归属：C01–C05为RF067-S1的harness/src/i8/script-package-builder.ts；C06–C07为RF066-S2的worker/src/i10-midscene-candidate-authoring.cjs。没有新增依赖、公开API、迁移、兼容外壳或运行时模型回退。

## 回归与复审

- JavaScript/TypeScript：tsc通过；rf057-pkce、target-profile、generic-worker-routing、midscene-diagnostics四个套件106/106通过。初轮回归发现旧只读不变量整句保留和多目标导航显示词两处兼容回归，均修正后全套通过，不另计已修错误数。
- Contract19＋11、Integration41＋runtime1全部通过。CLI五个指定文件的回归退出0；未重新运行无源码变更的Java或前端构建。
- RF066/RF067/RF068控制校验及docs通过。源码复审检查凭据来源/realm、正向点击未被约束过滤、首步业务断言保留、ID/fixture/DSL及单次模型失败传播不变；未删除认证、DOM或资金边界。
- 独立验收视角复核：反例覆盖无认证首断言、纯禁止/混合动作、只读/显式点击、单目标/多目标导航；原SSO实际隔离DOM和模型失败一次调用回归通过。未以这些隔离结果声称S5 LIVE通过。

## 新身份与托管切换

源码及回归收口后H=`5541e30b6537cf81ee603069817605757163106c919dcce69c55ae784a206609`。托管前六种活跃聚合为0、迁移44/44；一致性备份`.data/sqlite/offline-backups/rf068-s5-prereload-8fe3c37e-be6d-4b7d-b661-b4a3a74afd41.sqlite`，SHA256=`8512d6894c42b4eb96a600f84ad739dc7501db358022bef3cf1547f3170ae0ff`、integrity_check=ok。

仅停止旧自有Agent进程，既有start入口再次备份并启动；回执`.data/rf068-s5/9407be13-e4dd-4052-871e-23d80ef0efb8`，Harness84980/MCP86612/Worker105488均owned/current/healthy，网页104612。银行15容器仍运行约12小时，18443/health为200，无容器重建/停机/卷或日期操作。

原7a722b08身份失败报告保持原样，正式28项和整体GO不由本回执提升。

## 本轮第一次LIVE与继续修复

H5541e30b的报告`agent/runs/rf068-s5/1cb736f2-57ce-4bc8-a24f-eb7111925956/report.json`，03:58:23–03:59:56 UTC；BYOK阶段77012ms后失败`I10_MIDSCENE_LOCATOR_MISMATCH`。Journey=`journey_4701f342-4c55-4ea6-bf69-706a6662e596`，job=`buildjob_d27d8862-b06d-4ce0-affa-a214dfb0fb96`。

诊断的ACTION_EXECUTED已证明goto、SSO点击、身份页等待、账号及密码填写成功；原登录入口语义修复实际走通，本次不是认证未展开。失败动作6为“提交身份认证表单”。视觉提议导出CSS定位器哈希`da5dae5d399afec4d64bacfb9b3e1d655848c1cc7019427bb53c8232acc0c852`，与规范化`{kind:CSS,value:#kc-login}`的SHA256完全相同；Worker却拿整句“提交身份认证表单”匹配实际“登录”，因此误拒。未打印或读取凭据内容。

C08：为明确认证表单提交意图添加精确“登录”语义映射，取消登录/注册/转账/复合提交均拒绝，实际Chromium的submit input和静态文字/其他按钮正反例通过。另将本次真实plan出现的“停留在…，不执行任何提交操作”纳入C03/C04同一语义的测试及修复，不重复计数。新两个反例先红后绿；Worker/诊断65项通过，连同编译43项为108项。源码变化后必须再冻结新身份，不把该失败报告改写成通过。

最终源回归CLI50/50、测试注册清单109/109登记通过（105 CI、2受控运行、2历史）；精确diff whitespace与三批治理/docs通过。新H=`c52dddd9ee6b73487fd931f11c1bbb9cfa6dbc6d2b93144c32ba1ac3fd477d0b`。托管前活跃聚合0、迁移44/44；新一致性备份SHA256=`2ca4b08dd467f642881f557d710c16e74f202de18f86010b7fb7ed629350b52b`且integrity=ok，回执`.data/rf068-s5/2db8e48e-7f62-4c5e-b1a3-138b0f18c797`。Harness44272/MCP75792/Worker107916及web88832启动，运行H一致、三组件owned/current/healthy。S5新一次从起点执行；未接触银行服务/状态。

## 本轮第二次LIVE与约束收尾

Hc52dddd9报告`agent/runs/rf068-s5/00864950-e53b-49b2-95ac-adbbb55fb58f/report.json`，BYOK阶段96681ms后仍为LOCATOR_MISMATCH，但不是身份表单：job=`buildjob_b60f94fa-d72c-4a61-b638-0c1d2aab143e`的ACTION_EXECUTED已包含认证提交、回调到/portal/dashboard、账户导航到/portal/accounts和只读账户核对。失败动作10为“确认当前页面并保持只读状态。”；它没有可供视觉定位的业务文字，应是行为不变量而非expectVisible。

该措辞归C03既有纯约束错误，不另计缺陷数。补无禁止子句的纯只读策略反例，先红后绿；抽取统一的纯约束判定，避免只有出现“不点击”时才进入约束处理。当前编译/Worker108/108、tsc、Integration41＋runtime1均再次通过。旧报告封存，再冻结新身份验证。

## 本轮第三次冻结

H=`ebb0ead0ae443188bb9108b7f9157896fb5123c53ba3d6630badfcf2c0922158`；托管切换前活跃聚合0、迁移44/44；一致性备份SHA256=`b6348f726746e8c1174c1a17140ead2965bc013958cde03764be7b251982655d`、integrity=ok，回执`.data/rf068-s5/5f2c5487-8d6c-4cc1-bdda-ad3ec973126c`。Harness73328/MCP110452/Worker78428均owned/current/healthy，web60212。再次从S5完整起点运行，原银行不动。

本身份报告`agent/runs/rf068-s5/71e3b3cc-6cc9-4293-a7e0-008ae1324b45/report.json`失败于账户核对，job=`buildjob_0155375b-f108-4791-bce8-913daba6a28d`。认证和账户导航已执行；“只读检查账户列表中账户…”的视觉锚点仍错误保留为“账户列表中账户”，与可见“账户”不匹配。属于C07的动词后位置限定，不增加缺陷计数。反例复现并修复只读锚点的容器限定；原“是否存在…”句式回归发现后保留原解析，108/108再次通过。旧失败不改写。

## 本轮第四次冻结

H=`9a99cccd87589c4d5ab2544bbf7f1f779b18fcb932b04e06cfed62ebe480a53d`；六种活跃聚合0、迁移44/44，一致性备份SHA256=`38512747f9cb877306f7643819a1fe0db8b37b76bfc3f27fea8f597abb70a758`、integrity=ok；回执`.data/rf068-s5/f1ddf176-f93a-435d-ad28-6694f169c0af`。Harness94248/MCP58840/Worker106612均owned/current/healthy，web110744。第四次完整S5实机验收启动，未操作银行服务/卷/日期。

报告`agent/runs/rf068-s5/6646fe31-233c-4e9e-bbb8-38fde68aa967/report.json`在BYOK阶段36440ms后失败；job=`buildjob_79335111-033b-417b-84be-c10555b29985`。认证、账户导航成功，失败在“只读查看账户列表中的账户信息”。源码证明directVisibleFact提前返回“账户列表中的账户”，绕过后段清理；与C07同根因，不另计。将只读锚点的容器/币种限定和句末标点规范化收敛到genericActionTerms统一返回出口，点击操作不规范化，完整业务断言不改变。实际draft的账户/人民币余额/账户状态三种反例和“确认页面停留在账户列表，不访问历史受控门户”的C04反例先红后绿；编译/Worker108、tsc及Integration41＋1再次通过。人民币是定位语境，CNY和值仍须由完整账户业务证据验证，不以“余额”锚点代替币种验收。

## 本轮第五次冻结

最终本轮源码的108项及CLI50项回归通过，三批治理/docs和精确diff检查通过。H=`9361c808fd6aeeb1d661e60d67dcbbb920f0f87890a632711713736d492fb88f`；活跃聚合0、迁移44/44，一致性备份SHA256=`0f79b2d7678c6a717557840d11aaef8f7c43191e538aecaf0fe13ce32f662514`、integrity=ok，回执`.data/rf068-s5/3766a431-0526-41bf-afb3-386faa0b1bce`。Harness88084/MCP93908/Worker67832均owned/current/healthy，web86756。新一轮从S5完整起点执行；银行服务和状态保持。

第五次报告`agent/runs/rf068-s5/5d841112-8f94-408d-95ae-b2d203e10f2a/report.json`失败；job=`buildjob_45be9612-48da-451e-91fa-7c2b350ebdad`已经完成认证、账户导航和账户/余额/状态核对，说明本轮只读锚点修复已走通。最后“保持当前页面为账户列表，确认未触发转账、业务申请、资料或日期修改”仍被当整句文字定位。补C03/C04的页面状态/只读保护措辞，保留账户列表断言及无写入约束；无写入是否成立仍由S5真实前后银行快照验收，不能由约束文字自行宣布通过。新增反例先红后绿，编译/Worker108/108再次通过；不另计同根因缺陷数。

## 本轮第六次冻结

H=`3301077e82556dc7b6df76bf5cfd7179e4276afc649418887d0af92ceedcbb33`；最终108项及Integration41＋1通过，三批治理/docs、精确diff检查通过；CLI50项在此前同轮Worker收口时通过，最后仅补C03/C04编译语句并再次跑编译及集成门。活跃聚合0、迁移44/44，备份SHA256=`0d7c930c3ad265cfc04f3222b4909a524b960f950bd1e7dfbd5ef36c0c61a7b0`、integrity=ok，回执`.data/rf068-s5/a806e232-2c9f-4b12-b180-5023406b93d3`。Harness76728/MCP71420/Worker56856均owned/current/healthy，web74972。本身份再次从S5完整起点复测。

## 本轮集中汇报结论与剩余门

完成计数为**7项：C01–C06及C08**。每项有独立红→绿反例和扩展回归；认证、身份表单提交、账户导航和部分账户核对在本轮真实流程中实际走通。C07只读锚点的容器/修饰词修复已通过已知反例，但真实语义字段绑定仍未收口，**不计为完成**，更不把多轮措辞修复重复累计。

第六次报告`agent/runs/rf068-s5/5c3e2b09-a11a-46b3-ac79-46f92deb8f38/report.json`仍FAILED，BYOK阶段41399ms；Journey=`journey_d3549dd6-0c56-42fd-8315-dfda0d038196`，job=`buildjob_a92433bb-2f58-431a-8c8b-9957b69b63e9`。当前H与结束后inspect一致；无正式Run/Task。真实失败仍在C07：账户页面已经打开，但“查看账户列表中的账户标识、人民币余额和账户状态”的视觉锚点输出为“账户标识”，实际AccountList的字段为“账号”，当前代码仍要求文字包含而非显式字段语义绑定。

另已确认、但尚未执行到的源码缺口：下一动作“检查页面是否出现错误提示或加载异常，并保持当前页面不变”被编为expectVisible，定位词是“页面是否出现错误提示或加载异常”。有无错误的观察不应被当成必须找到该句文字；不能因为页面无错误而失败，也不能直接删掉此检查使目标变弱。此项只是源码回放，不记实际LIVE失败。

剩余修法应收敛为显式银行适配器的业务字段/断言语义：区分定位锚点、CNY及余额/状态业务断言、页面状态和错误存在性观察；不要继续让模型自然语言整句充当DOM标签。保留视觉选点、DOM交互验证及完整账户行/币种/余额证据要求；用本次实际draft及有错误/无错误反例验证后，再冻结新H从S5起点验收。当前不实施额外合同/断言种类扩展，不用旧报告或删断言凑通过。

本轮已按“至少5项后集中汇报”完成7项修复，经历6次新身份真实复测；S5保持BLOCKED，正式28项/整体GO未提升。最终inspect为三组件owned/current/healthy、六种活跃聚合0、迁移44/44、web74972运行；银行15容器仍连续运行约12小时，18443/health=200，未重建/停止容器、删卷或改业务日期。报告bankAfter=NOT_RUN，不宣称该次完整银行前后快照门通过。
