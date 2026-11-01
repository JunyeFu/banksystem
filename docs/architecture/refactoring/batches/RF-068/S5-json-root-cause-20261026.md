---
id: RF068-S5-JSON-ROOT-CAUSE-20261026
title: S5 模型 JSON 格式根因与连续复测
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-26
owner: Codex
---

# 范围与证据

沿当前S5连续修复授权，银行15容器保持原状态，不转账、不改卷或业务日期。Controller仍为deepseek-v4-flash，视觉仍为mimo-v2.6-flash；失败任务与本地模型探测的模型、端点和密钥已在内存比较一致，仅输出布尔结果与端点摘要。原始模型正文、reasoning、密钥和解析器原始消息不保存。

原报告7dabe00e只有JSON_SYNTAX码，不能倒推具体语法。新增生产响应边界回执保留格式、finish_reason、token用量和会话/身份；先于解析写入，成功/失败均保留。38项专项、CLI50、Contract19＋12、Integration41＋runtime2通过。三次协议探测合法JSON，均stop，不能替代S5。

## 第一轮真实格式取证

H=`8a44ab3df5949f9e7c4982086474309373ef12a22bae09b7b6a0fe119cae8c55`，启动回执`.data/rf068-s5/0b28f973-b748-4ddc-8864-388806ca25ae`，SQLite备份SHA256=`3f6507df55efdc377dbdc207e87fdbef09e0d9b36f3f101dce79a60770174de7`。

真实报告`agent/runs/rf068-s5/4ec039a0-76d3-4ba0-a0e3-a48c0f68b718/report.json`：BYOK草案21685ms后JSON_SYNTAX；turn9950dc90-3446-4059-9604-97fc7543deac，未创建银行执行任务。回执`.data/evidence/model-response-formats/7d612114-6d0b-4254-bb48-410e14fdd194.json`：STRING、1107字符、2481字节、OBJECT且闭合、无围栏/BOM、jsonValid=false、finishReason=stop、input470/output1821/total2291。不支持截断或围栏假设；具体非法语法尚需定位。

## 第二轮精确语法取证

针对已观测的“闭合对象仍非法”，诊断仅增加自有语法类别/数值偏移及所有文字都替换为x的结构骨架，不保存原始parser消息。22项适配器测试通过，含秘密字段/内容不泄漏反例。三次对原失败输入的隔离模型探测再次合法，全部保留，不作为正式通过。

仅为捕获真实间歇错误，冻结诊断候选H=`9a829e6409281d8df39c9256156ddbd2f0c382167bef789efe89839757efc472`，没有宣称根因已修好。启动回执`.data/rf068-s5/3a4a91af-2913-493a-8d1b-b08cbac6d532`，SQLite备份SHA256=`471aed7000307599806e5aa0071ce9409c971a7036bf6170cf699ce83e35aa43`。Harness101140/MCP90848/Worker114552、web70804；银行服务不动。

后续按实际回执追加根因、最小修复、回归和完整S5结果。禁止自动截取/修补JSON、隐藏重试、切换模型或接受不符合草案合同的结果。

第二轮报告`agent/runs/rf068-s5/ee51632e-fe60-40ec-9a80-446e1622bd66/report.json`：模型JSON合法，857字符/output1720/stop，响应回执d4c2d48b-bb8b-47f9-b5c3-17f437908e45；不能因此关闭间歇JSON缺陷。新的实机失败是I10_MIDSCENE_LOCATOR_MISMATCH。job=`buildjob_88178c62-7d78-4f04-a667-9e964653ce3e`，认证7个动作成功到/portal/dashboard；第8动作直接expectVisible账户列表四字段，计划中没有从首页打开账户列表的导航。视觉落在导航项，Worker正确拒绝把导航文字当作完整账户表。没有放宽Worker匹配。

最小修正是在已有作者化提示中明确“认证后单独导航至目标页，再断言内容，不假设认证落地页就是目标页”；不静默插入导航、不硬编码银行快捷路由、不把只读检查改成点击。新增提示合同/步骤保持反例，39项作者化＋适配器测试通过。第三轮H=`1467093faba629dd96f5ab22390cbaa7c83bc8d59b3f7de9b55cfac894def238`，启动回执`.data/rf068-s5/04709e9f-1031-45b8-b4c3-d032c145e657`，备份SHA256=`41f6fe24e38303d7f84d87fdf4af618e8f402f38ca32a5811e809da475d37e24`。继续完整S5，格式根因保持未定，银行不动。

第三轮报告`agent/runs/rf068-s5/aee6a070-68f4-42dd-a26e-2468dcb2f7d1/report.json`：JSON合法905字符/output1768/stop，已显式导航/portal/accounts且四字段断言通过；第10动作“检查完成后保持在账户列表页面”又被当作字面定位。仅修既有终态语法的完成体次序（“完成检查后”与“检查完成后”），保留真实点击、检查余额等独立业务动作；116项编译/Worker回归通过，不把此项重复计作新根因。

## 接入合同核对与修复

真实ChatOpenAI→本地HTTP服务器合同证明当前SDK确实发送response_format=json_object、temperature=0、无tools；不是withConfig丢参。本地模拟完整但非法JSON响应，安全保存VALUE_DELIMITER/stop并仍拒绝，未修剪或修补响应。

[DeepSeek官方JSON Output说明](https://api-docs.deepseek.com/zh-cn/guides/json_mode/)（2026-10-26核对）要求JSON模式、提示含json并给出格式样例。既有提示只有字段描述，没有样例：这是已确认的接入缺口；已补通过JSON.stringify生成的合法样例、明确转义字符串和禁止围栏/注释/尾逗号，业务值仍只能来自用户。不凭这条文档声称第一轮具体非法字符已复原，也不声称已证明远端内部根因。40项作者化/适配器测试通过。

探测输入核对补充：最初6次探测的续接分隔符是字面反斜线n，不能作为逐字原始请求回放；后续从SQLite重建真实LF分隔的原失败输入、恢复旧系统提示，再做2次隔离探测，均合法JSON/stop（input470）。全部仅用于协议诊断，不算LIVE通过。后续以实际生产入口回执为准。

## 第四轮：真实执行通过，下载归属投影失败

H=`de1f6c6f14628e488f711e040cb0ca5907a53f78b7b632578c91080779abdcf1`，回执`.data/rf068-s5/91a87806-b10f-4e6a-b99b-6e8931bdce54`，备份SHA256=`16de01bd01f709b4f8581338f4c9f9040b2c5168971d4410fd14e75ab013460e`。报告`agent/runs/rf068-s5/e5cb2ba7-e6c0-4e0b-bab4-96c15fd9c3e6/report.json`：turn334afcf4-ea08-4a31-93e9-6a5b71143399为COMPLETED、Journey=journey_f5e9019a-3265-4dfd-a462-fff78989f2a9、run_90b23c95-9e13-49ff-a62f-8247e5367fe0为PASSED、task_51fdcc61-47bd-4726-a6e7-d62333823aa4为SUCCEEDED。独立验证器VERIFIED，7工件摘要/大小均正确，实际账户页面四字段和终态动作成功。S5仍FAILED，不能用执行通过替代完整验收。

首个后续失败为RF068_ACCOUNT_EVIDENCE_DOWNLOAD_FAILED。单独只读复查实际网页下载接口返回404/AGENT_ARTIFACT_NOT_FOUND，Journey卡片只有草案MD/JSON及结果报告，未投影同run/task的DOM/NETWORK/LEDGER；应用归属门正确拒绝不在卡片的工件。另有真实字段不一致：Harness卡片给byteSize，CLI却读取size，导致前端缺少大小。

修复只补Harness同namespace+runId+taskId的工件卡片并去重；CLI将byteSize映射至公开size。隔离截图/trace仍不能下载，不扩大访问其他任务/命名空间。新增真实SQLite/ArtifactStore反例先失败，修复后精确卡片、部分绑定排除与隔离下载拒绝通过；一轮测试曾错误读取HarnessError.code，已按既有errorCode修正测试，不算产品缺陷。CLI离线17项通过；完整证据/状态机与合同集成继续回归。

回归收口：证据24、Journey状态机34、CLI离线17、Contract19＋12、Integration41＋runtime2、Browser All五种检查全部通过，登记109项及三批治理/docs通过。独立逐层复查：只读卡片不签发下载grant；namespace/run/task三重绑定；隔离工件flag=false且实际grant拒绝；CLI公开字段保持size；下载仍走原同源代理及字节摘要校验。没有宽泛允许任意artifactId。

第五轮H=`6343fb526a418f81e7bc04f867d8d03a03076b6d73584fda656ad7a43ef7a68b`，启动回执`.data/rf068-s5/df45c789-efff-4910-b870-85fea101dc88`，备份SHA256=`f9819f96a26b79dcd1756d5bb474d4b6cb376128ea2cf937c690e809a600fb0a`，Harness94056/MCP80808/Worker102876。再次从S5完整起点验收，旧报告不改写。

第五轮报告`agent/runs/rf068-s5/ec29e306-fe99-498f-9791-5b87a046d3b0/report.json`：JSON合法862字符/input637/output1669/stop；认证、导航与账户业务断言通过，末态“保持在账户列表页面，也不访问历史受控门户”误编click。“也不”未被原否定分句规则识别，是既有C03的漏项，未重计新根因；仅补已观测连接词，反例保证正向查询点击不丢失，116项及Integration41＋runtime2再通过。不存在为此放宽视觉匹配或允许历史门户访问。

第六轮H=`9f082d4b739c5d298a5b4ccaca6df8920052cfa23bf0ff62c539d348c156a289`，启动回执`.data/rf068-s5/fa65333a-4be5-463e-a779-204e3a88c55e`，备份SHA256=`43581aa3506c79a86ed4447d89908b94e5cb8a3589a6a6a61a59ef68605bbb04`；Harness117312/MCP109212/Worker112840、web75360，原银行不动。

第六轮报告`agent/runs/rf068-s5/50c4d275-f687-49d0-9113-e5f8c0e09804/report.json`：真实turn/run/task成功且独立proof VERIFIED，三个工件均已下载，后续断言RF068_ACCOUNT_STATUS_REQUIRED失败。只读真实Keycloak登录/API回读确认两账户均status=Active、currency=CNY；CustomerController原样返回Fineract value，OpenAPI状态为自由string，AccountList原样显示Active。验收脚本却硬编码ACTIVE及中文“正常”，不是银行数据错误。

修复只在根scripts/test/rf068-workbench-{assertions,acceptance.test}.mjs：活动状态大小写归一后核验，DOM仍按账户实际值及现有页面展示规则核验同一完整行；未将Closed/INACTIVE/缺失/空状态认作正常。4项驱动回归通过；对本轮原DOM/NETWORK/LEDGER及新只读API快照的验证器回放通过（明确为VALIDATOR_REPLAY_NOT_NEW_LIVE），证明修正匹配原事实，不改写失败报告或业务数据。原问题工件下载也已在真实网页API回读HTTP200、30314字节且摘要匹配。

第七轮H=`64f1fb441e9b7d6b24a5d4701dd782e093b48667797d76d1e1184a51475b9d6e`，回执`.data/rf068-s5/e4a9f4a0-f9bb-46ba-8a78-c1d52faf9e99`，备份SHA256=`6c3eeb2a9a7eaea34eb58fe92c5d64cbd1cc0f8c2fb0e69b8240cd37f368255f`。报告`agent/runs/rf068-s5/1880d953-79d2-48a1-9c90-fa81f0c794d1/report.json`在浏览器动作9失败：`在账户列表页面只读核对账户、人民币余额和账户状态`被分类为click，故未附pageObservation。原语法只接受位置短语以中/内/里结束，遗漏“页面”。修正位置语法，不扩大可点击控件匹配；现有116项（含实际短语和显式点击反例）及Integration41＋runtime2通过。状态回放通过不替代本轮失败。

第八轮H=`e868b88d79ecf796af5d88103755207808a532a81527524599bd343e8161e470`，回执`.data/rf068-s5/1545267b-2799-4e09-9ae4-ef62b84a90f3`，备份SHA256=`9e1e6230071703fc82428e5a9b54f5f4d4a8aae379e6c1615b9e2567b435122e`。报告`agent/runs/rf068-s5/3ba35ed8-1cdc-4012-be40-8e5009bdbc8e/report.json`：真实执行/独立proof/三工件下载及账户目标已通过，Quality回读RF068_QUALITY_READ_FAILED；原接口实测HTTP413/OUTPUT_BUDGET_EXCEEDED。只读测量200条运行投影73120字节、最大单条482字节，已超L1=16KB及L2=64KB；列表实际上限200条，却套用了面向小输出的L1。

仅将GET /api/quality/v1/runs分配既有L3=128KB，不修改全局预算、MCP预算、绝对128KB限制或200行数，不删历史/静默裁剪字段/把413当成功。新增真实HTTP 200行容量反例先413后200，包含仍拒绝超128KB的负例；Quality及分页8项、Integration41＋runtime2与三批治理/docs通过。无HTTP形状/表结构变化。

第九轮H=`c0440b23070ed2951235f2f276e8b1d42784e658b9d6054e159b92ec768932a5`，回执`.data/rf068-s5/01102e7d-01a9-4d51-a33d-543730430c91`，备份SHA256=`4b472b6501d758841765cc995e3e631663d3817f27f322199276fc5ca60c268c`；Harness118692/MCP121328/Worker55112、web93908。继续全S5，不续写前次失败为成功。

第九轮报告`agent/runs/rf068-s5/d89452e4-12fc-4601-881a-b7782f792409/report.json`：执行、账户目标、Quality回读均已越过，随后RF068_DOWNLOADABLE_EVIDENCE_REQUIRED。实际MCP readJourney卡片没有byteSize或size，Agent因此也没有size。分层源码确定是mcp/src/journey-evidence-projection.cjs读取了不存在的card.size，而Harness实际发byteSize。第四轮仅在CLI改字段并修改mock夹具的修复不完整；这次实际接线证据纠正此前判断，不将本地mock通过冒充真实链通过。

最终字段边界：Harness byteSize → MCP size → CLI size → 浏览器size。MCP只在这一边界转换一次，CLI恢复消费既有size，不加双字段fallback。MCP格式反例先失败后通过；新增真实ArtifactStore/Harness→MCP→Controller/CLI应用→受控下载接线，验证实际字节长度、摘要和正文一致（合成测试工件，无银行动作）。专项21项、CLI离线17项通过，重新跑合同/集成后再冻结。真实Quality列表现场已恢复200/L3、200行73120字节。

第十轮H=`8ff4a6bcf75ed230719dbae4f6c01aa77b351b2e699b8f1bea68c5a02bc62157`，回执`.data/rf068-s5/ffb20250-53b0-4600-83dc-23924dc9cf21`，备份SHA256=`ae0cc458639a12c4d7e616750b17ee0eb4d8164b1be5cec661631cd622f54f03`；Harness118684/MCP113364/Worker77688。Contract19＋12、Integration41＋runtime2及三批治理/docs再次通过，继续当前H完整S5。

## 最终验收与复审

第十轮完整LIVE_E2E PASSED：`agent/runs/rf068-s5/606619fe-6611-4ace-99f9-9f50572c9d84/report.json`，前后H均为8ff4a6bc…bc62157，所有10阶段及10项检查通过。真实模型生成草案、实际Keycloak认证/账户导航/业务断言、正式Worker执行、证据下载、Quality一致性、刷新/仅重启Agent网页、历史恢复、配置菜单及窄屏均有回执和9张截图。没有产品内重试或切换模型；9份失败报告保持原样。

Journey=`journey_6ab4cb31-57b6-4ebf-b039-34513639a4d3`，Run=`run_d58133e5-efb3-4c9b-afdd-b256cf055358`，Task=`task_9119db5b-7bfd-423c-a913-4742da78c969`。独立Harness验证器VERIFIED，run PASSED/task SUCCEEDED，7工件大小及摘要均验证；网页重启后另开CLI进程再次只读verify，同样VERIFIED。完整SQLite执行快照仅1 run、attemptCount=claimCount=1，读历史/刷新/网页重启没有重派。

两账户及流水前后SHA256均为`d89b83251469c1369d3918b7905557533a762c9a7d0355fc66cc60d9a2044303`，实际CNY活动账户完整行与独立API核对成立。原15个银行容器持续运行2天，18443/health=200，无银行容器替换/停止、卷/日期操作或银行业务写入。最终Harness118684/MCP113364/Worker77688均owned/current/healthy；网页受控重启后PID121348，活跃聚合0，迁移44/44。

复审按独立合同与反例重新读链，不声称第二位人工审查：真实SDK JSON请求参数、模型正文不持久化、草案严格解析、禁止动作不变click、完整账户行而非标题、MCP字段边界、同namespace/run/task工件归属、隔离下载拒绝、Quality限额及无重派均有对应证据。桌面和窄屏真实截图已打开检查，无框架错误覆盖，记录仍可读。当前通过只说明该H的S5范围完成，不是所有模型输入的格式保证；首份非法JSON具体字符未保留，未将“缺样例”宣称为已复原的唯一远端内部原因。

S5及RF068本批状态同步DONE/CLOSED；RF057正式28项、RF065安全镜像/远端CI及整体GO不自动提升。未提交、推送或发布，原脏工作区保留。
