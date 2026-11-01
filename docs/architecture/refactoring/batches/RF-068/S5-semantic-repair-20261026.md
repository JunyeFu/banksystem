---
id: RF068-S5-SEMANTIC-REPAIR-20261026
title: S5 业务语义断言与实机复测
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-26
owner: Codex
---

# 新一轮修复

沿S5最新授权，不首错结束，至少5项独立错误后集中汇报；不重复计算10月24日7项。原银行15容器连续运行2天，初检18443/health=200；原Agent三进程已退出，原身份3301077e可核对，SQLite活跃聚合0、迁移44/44。没有更换配置模型、银行容器/卷或业务日期。

| 项 | 现有代码失败与反例 | 修复与验证 |
|---|---|---|
| D01 字段绑定 | 真实失败将“账户标识”当DOM文字，但页面列名为“账号” | 仅显式银行绑定生成bank-account-fields/v1；定位锚点来自适配器实际字段，泛化网站不套银行语义 |
| D02 复合事实 | 标题可见时，缺失状态的账户行仍被生成脚本判为通过 | 请求字段必须在同一完整账户行成立，不用单一锚点代替全部事实 |
| D03 空结果 | 标题与表头可见但tbody为空，旧脚本仍通过 | 空表/占位行明确失败BANK_ACCOUNT_ROWS_MISSING |
| D04 否定观察 | 真实draft“页面无错误”被编成expectVisible错误文字 | expectNoErrors在当前页验证可见错误状态；无错误通过、可见错误失败、成功提示/隐藏错误不误拒，URL不变 |
| D05 正式断言 | 正式候选只有expectVisible，没有CNY与金额/状态业务语义；USD或非法余额仍通过 | schema→DSL保留版本化pageObservation；作者化与候选嵌入同一闭包无依赖的字段断言，错误币种/非法余额反例失败 |
| D06 托管PID复用 | web登记74972已被conhost.exe复用，18790空闲，但原status报OWNERSHIP_CONFLICT | 创建时间不同时仅视为过期登记；同一创建时间却路径/命令不符仍拒绝；不停止无关进程，端口占用检查保留 |

D01–D05修复前正式套件有5个独立反例失败（复合测试的父失败不重复计数），包括实际Chromium执行的“缺状态、空表、错误币种”错误通过。D06为现场已观察失败；隔离PowerShell AST执行真实函数，PID复用/同创建时间冲突/实际归属正反例通过。

源码归RF067-S1编译/合同，RF066-S2 Worker消费，托管与真实验收归RF068-S5。新增harness/src/i8/page-observation.ts，严格schema的可选pageObservation与expectNoErrors，无HTTP接口/数据库迁移。既有DSL无该字段时行为不变；冻结身份保证新旧执行器不混用。Worker代码集登记新编译模块，exact membership校验通过，35文件。

## 回归与复审

编译/Worker四套件115/115，Contract19＋11、Integration41＋原runtime1通过；新增托管测试后runtime2/2。CLI五文件50/50，tsc、三批治理/docs通过。复审补齐：纯观察不导航、未知错误正文不输出、生成脚本即使不传afterStep仍执行业务断言；错误码使用已有BANK/WORKER安全家族，否定目标不是删除断言；非银行绑定拒绝伪造pageObservation。

以上为源码/隔离证据，不等于S5、正式28项或GO。真实BYOK验收结果随后按本轮新身份登记；原失败报告不可改写。

## 冻结与安全启动

H=`1fb11e2ae783f9c9910fe8dbc8460aced5d6a6d42ce8e3e553891d8d0884a680`。启动前发现旧MCP PID71420也被10月26日新进程复用：其创建时间晚于旧登记的10月24日startedAt；其余原进程不存在，18788–18790均空闲。核对所有代际后，仅将旧登记归档到`.data/rf068-s5/stale-receipts-dfcf8106-4580-47e3-9879-b9881a73c550`，保留原文件可恢复，没有停止任何复用PID进程，也未改托管器“未知活进程必须拒绝”的保护。

既有start入口生成原SQLite一致性备份`.data/sqlite/offline-backups/rf068-s5-01137e17-226d-4c33-bfd3-41ab8a7955e4.sqlite`，SHA256=`6e4a42399f0b0bd6fde387d701e90e745f28e4e775a42f77bf12c46cd8b79cb6`；迁移44/44，活跃聚合0。启动回执`.data/rf068-s5/8e4b2af7-884c-499d-b496-6813b6cc0fa0`；Harness77172/MCP66740/Worker75588均owned/current/healthy，web83752运行。银行原15容器持续运行、健康接口200。

## 本轮第一次LIVE与继续修复

H1fb11e2a报告`agent/runs/rf068-s5/841e43f0-2c9b-4a83-bcd4-f485aa3f3001/report.json`失败，Journey=`journey_c59066b7-73d9-4929-977c-4ea799542dc0`，job=`buildjob_b8e33ec0-7402-4f44-b245-019b7bca0902`。ACTION_EXECUTED证明认证、账户导航、带完整pageObservation的账户/币种/余额/状态检查均成功，原C07现场阻塞实际越过。

最后一句“确认保持在账户列表，且未发起转账、未提交业务申请、未修改资料或日期”仍按文字定位而误拒。归10月24日C03/C04终态语法，不计本轮新的5项；新增当前draft反例先红后绿，提取否定业务动作到不变量并保留账户列表终态断言，115项再次通过。原失败报告封存，修复后再冻结新身份从S5起点复测。

复审还将字段语义严格限定为显式银行的账户列表，不误套贷款申请还款账号等其他模块；同反例通过。H=`0b12ec831976b30a92034ec712ea8b6fd05798249ab1b02ec200bd19b30f2ae0`，115项、Integration41＋runtime2及治理/docs通过；仅重载自有Agent，当前Harness102224/MCP114544/Worker114676均owned/current/healthy、web77028运行。SQLite备份SHA256=`75b79b118bf3049fc0bdb334389b7d6cb280158d2cc5cadf3ba39abfc45bad73`，回执`.data/rf068-s5/c65c2a9c-5821-4211-bb54-30bbc844445f`。第二轮S5从起点运行，银行服务不动。

## 第二轮启动验收预算修复 D07

报告`agent/runs/rf068-s5/772dad6e-6786-447b-b851-c0da2b0d2974/report.json`在BROWSER_BOOTSTRAP的90004ms失败，console错误/警告0；实际截图是有内容、无框架覆盖的首页，但连接状态一直LOADING，未创建银行任务。结束后单次GET bootstrap返回HTTP200/READY、同一H，耗时7887ms，未发现持续端点故障。

源码确认：产品现有doctor为Controller最多90s→视觉子进程最多90s→3个本地请求各10s的串行合同；驱动却统一90s等待bootstrap，预算本身不充分。具体哪一个外部探测当次变慢没有分段回执，不能臆测。D07仅修改验收驱动：启动240s上界，4次bootstrap的刷新/网页重启阶段按4次合同预算，其他阶段仍90s、业务执行仍15min；response和UI连接等待共享绝对阶段截止，超时返回具体RF068_BOOTSTRAP_RESPONSE_TIMEOUT。不增加模型重试、缓存、端点回退或NOT_READY豁免。

新增纯预算回归及原验收断言4/4通过，Contract19＋12通过。此项不替代D01–D05最低五项；Browser插件未列出，按项目已有pinned Playwright流程定位，未安装依赖或修改前端。源码/驱动变化后再冻结新H，旧失败保留。

## 第三轮与模型诊断 D08

H=`9e79693e6d4ab0fa144905ae716c03b635ae1b6801a22c03c3cb30d5f1a513da`；回执`.data/rf068-s5/670a4733-7b5c-415c-9237-baf28ad61495`，SQLite备份SHA256=`1bbef8dbf3bbe4c9fae89f5bca282a4d2d99b08453d8c7377c7d3b379097db67`。Harness89716/MCP98124/Worker59188、web114652。

报告`agent/runs/rf068-s5/6462a56a-686d-4ef4-9093-9a05b9a1eb3b/report.json`通过bootstrap（8309ms）、账户基线、凭据与缺输入；BYOK草案生成21241ms后以JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID失败，未创建Journey/Run/Task。原输出未保留，无法倒推具体违规项；不能声称已确认7步、null、代码围栏或其他具体原因。

D08修复原有诊断丢失：区分JSON_SYNTAX、NON_STRING及schema拥有的字段/issue.code，代码经过既有生产service保留；不输出parser message、模型值、未知键名或正文。模型仍只调用一次，违规输入仍在MCP写入前拒绝。15项作者化回归通过，包括生产service保留具体码与无MCP写入。此为可定位性修复，不宣称修好了不可回放的那份模型响应；后续新身份复验若再失败可明确归类。

第四轮H=`39de513838487f299c4ee7693f80b538e13408eb370b00d99eb10cb32d250198`；源码/合同回归、三批治理/docs通过后仅重载自有Agent。启动回执`.data/rf068-s5/58965f7b-c157-4bec-b9da-45a179e88ee5`，SQLite备份SHA256=`403993d0d80cdf273dcbedef92a59ccac5a07a220a4531516d8eed0273f1bb4f`；Harness90668/MCP106220/Worker84836及web94280运行，三组件owned/current/healthy，活跃聚合0、迁移44/44，原银行不动。

报告`agent/runs/rf068-s5/19bae329-3f1b-44b6-ad51-b00008330489/report.json`：模型草案合规、账户四字段真实断言再次通过，job=`buildjob_cfc67f7f-1cb5-46b9-b0ff-42df74bf8623`最后“确认页面保持只读并停留在账户列表”仍误匹配文字。继续归原C03/C04，不计新的修复数；按纯状态指令前缀及无正向交互动词识别状态，再提取停留目标，不再枚举整句只读词序。当前反例先红后绿，明确点击不被状态转换吞掉；重新跑115项和集成门后再冻结。

## 最终集中回执

本轮完成D01–D07共7项新修复，不重复计算10月24日7项，也不将C03/C04的词序补全重复计数。D08是附加的安全诊断增强，不计为“模型非JSON响应已修好”。115项专项、作者化15项、CLI50项、Contract19＋12、Integration41＋runtime2、测试登记109项、三批治理/docs与精确diff检查通过；不同源码阶段的回归如上记载，没有把未跑的全产品CI标绿。

最终H=`4e6df19353a4f171e6599ed27b9856cff0d8ca028ce54a52822728fc25fef2e1`；启动回执`.data/rf068-s5/f472835f-4c98-4de7-bf48-542f0816827d`，SQLite一致性备份SHA256=`8c39c1db8425e74bcc99a70f38c12d20e71d3aee95150070906d4d456ab89496`。当前Harness98136/MCP115140/Worker64200均owned/current/healthy，web74584运行，六种活跃聚合0、迁移44/44。银行15容器连续运行2天，18443/health=200；未停止/重建银行容器、改卷或业务日期。

第5次报告`agent/runs/rf068-s5/7dabe00e-4788-4347-a35f-25b6b5802742/report.json`仍FAILED：通过权限、页面连接、银行基线、凭据引用及缺输入；生成草案22253ms后返回具体`JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_JSON_SYNTAX`，未创建Journey/Run/Task，bankAfter及后续证据/历史/重启/窄屏门NOT_RUN。结束后H无漂移。S5继续BLOCKED，正式28项及整体GO不提升。

模型协议核对：本机LangChain官方实现的jsonMode使用withConfig(response_format=json_object)，与当前调用一致，反证“withConfig丢失JSON参数”的猜测。另一次不操作银行的受控真实模型探测：输出827字符、1593 output tokens、JSON合法、无代码围栏、finishReason=stop，草案合同通过；模型正文未回显/保存，银行操作0。该探测不能解释前两份未保留的非JSON正文，也不能覆盖真实失败或证明模型稳定交付。

剩余硬门：当前端点出现过合法JSON及非法JSON，需对下一次失败保留最小脱敏格式/结束原因证据，确认具体协议或输出问题，再做有依据的处理；不猜测围栏、截断、具体字段，不静默修复JSON、重试、换模型或删合同取PASS。随后仍从当前有效身份的S5起点执行完整只读验收。原银行状态保持，过期登记仅可恢复归档，未杀死任何复用PID进程。
