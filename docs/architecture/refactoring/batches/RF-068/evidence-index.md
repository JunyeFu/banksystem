---
id: RF068-EVIDENCE-INDEX
title: RF-068 Evidence
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Evidence

## 2026-10-26 模型格式取证与连续修复（当前）

见[JSON根因与连续复测回执](S5-json-root-cause-20261026.md)。真实模型曾返回非法对象/stop，非围栏/BOM，未观察到length截断；SDK真实HTTP合同确认JSON模式未丢失，补齐官方要求的有效格式样例，但不捏造原响应具体非法字符。继续修复了导航遗漏、位置/终态语法、正式工件卡片、MCP大小映射、状态核验及Quality列表预算。

当前H=`8ff4a6bcf75ed230719dbae4f6c01aa77b351b2e699b8f1bea68c5a02bc62157`，报告`agent/runs/rf068-s5/606619fe-6611-4ace-99f9-9f50572c9d84/report.json`完整LIVE_E2E PASSED，10阶段/10检查通过，7工件摘要和大小独立VERIFIED，历史/网页重启不重派。银行两账户及流水前后摘要相同，15容器连续运行，未操作卷/日期。S5与RF068本批关闭；9份此前失败保留，正式28项、整体GO及RF066/067其他批次状态不自动提升。下文均保留各阶段历史，不覆盖当前结论。

The initial sections record planning-only history, including the former Figma transport failure. The S1 implementation receipt below supersedes that unimplemented statement for S1 only; other slice/LIVE completion is not implied.

## Control verification 2026-10-19

- Actual `python scripts/architecture/validate_refactoring.py --batch RF-068`: exit 0, REFACTOR_VALIDATION=PASS.
- Shared docs validation: exit 0. No frontend code/build/browser/LIVE test executed; the Figma high-fidelity source gate remains unavailable.

## Dependency update 2026-10-19

Native full context and screenshots are now available for approved v2 main 2:60 and model configuration 11:1017. The former connector blocker is resolved. RF068 remains dependent on RF067 persistence and RF066-S2 production composition; no Agent frontend/build/browser acceptance is claimed. Continue using the Figma design-to-code workflow for the remaining approved menu/state nodes when implementing their views.

## 前端接入任务细化（非实现证据）

- 原两个泛化切片拆成五份任务包/切片：入口、历史、对话、模型、实机；每包包含业务目标、输入输出、具体微任务、路径、已观察易错点、分级命令及完成门。
- backlog新增五个唯一工作项，依赖源头仍是RF067与RF066-S2；不另建路线图，不把未实现功能改为DONE。
- 补齐界面位置/能力归属、状态语义、Figma节点、组件落点和视觉/功能验收矩阵；不增运行时Mock、备用模型、通用插件或另一执行账本。
- 初次规划后实际运行RF066、RF067、RF068治理及docs校验均退出0；这只验证文档控制一致，不证明前端或LIVE通过。最终同步后的实际校验另附以下回执。
- 本轮未修改产品代码、OpenAPI、依赖、服务或端口；没有构建/浏览器/模型/资金/数据库操作，没有提交推送。

### 实际规划校验回执

- FRONTEND_PLAN_GRAPH=PASS frontendSlices=5 dependencies=ACYCLIC status=PLANNING_ONLY；核对唯一工作项、依赖存在、无环，RF066-S1仍DONE、RF067仍READY、新前端切片未标DONE。
- `python scripts/architecture/validate_refactoring.py --batch RF-066`、RF-067、RF-068分别退出0，均REFACTOR_VALIDATION=PASS。
- `python scripts/docs/validate_docs.py`退出0，DOC_VALIDATION=PASS metadata=754 links=243；仅证明规划/文档一致，不证明实现或运行通过。

## S1 implementation, verification and review — 2026-10-21

### Delivered and bounded

- UI-F01：新增agent.html/vite.agent.config.ts/src/agent入口，base=/agent/，独立输出dist-agent/agent.html；原Quality的dist/index.html保留。品牌直接复用public/favicon.svg，不复制第二份源资产。
- UI-F02：OpenAPI1.1为唯一输入，generate:agent-api生成1192行类型及15项operation路径，check:agent-api精确检测漂移。JSON客户端消费生成类型/路径，二进制操作不冒充JSON；无手写业务DTO或API路径。
- UI-F03：Figma原生Full账户文件AGcoUj1UHujnoV0EPhvGLN的2:60/61/65完整上下文及截图均已读取。复用Ant Design、原品牌和九枚Figma原始图标，本地精确Noto Sans SC字体，未引入第二UI体系。页面/弹层/抽屉根类隔离，Quality不导入Agent样式。
- UI-F04：只读bootstrap为唯一页面API调用；CSRF只存内存，同源写请求不带凭据，403清除绑定、不自动刷新或重放POST。连接中/NOT_READY/403/网络不可达均有实际状态；不在本包读取历史、发送任务、读取密钥或启动模型。
- 可操作：建议填入本地草稿、键盘输入、设置/重连、Quality只读链接、桌面侧栏开合、移动Drawer焦点和Escape关闭。未接入的新会话、发送及附件禁用；历史搜索和模型选择不伪装成可用操作。

字体原件来自Google Fonts的Noto Sans SC Regular分发，许可证使用[官方OFL文本](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt)。本地字体10,540,644字节，保留原件不做系统安装或字形修改；原OFL随src与dist-agent/assets/NotoSansSC-OFL.txt一起分发。新增唯一显式开发依赖yaml@2.9.0，应用目录npm以--ignore-scripts同步已有锁文件；无全局安装、无模型配置读取。

### Actual verification receipts

| Level | Command / case | Actual result |
| --- | --- | --- |
| STATIC | npm --prefix apps/quality-case-portal run lint / typecheck | exit0；无lint告警，严格TS通过 |
| UNIT | 同前缀run test | 25/25；原Quality16项与Agent9项，覆盖CSRF、403不重放、无隐式重试、编码和安全错误 |
| BUILD | 同前缀run build / build:agent | exit0；Quality与Agent分别构建。Quality入口时间16:09:27，后续Agent构建未覆盖它 |
| CONTRACT | 同前缀run check:agent-api | AGENT_API=PASS |
| CONTRACT | verify-agent-workbench.ps1 -Scope Contract | 18/18；含RF066归属的/agent/资源、favicon和深链接修正，以及原Host/Origin/CSRF/边界回归 |
| BROWSER | verify-agent-workbench.ps1 -Scope Browser -Case Foundation | 2/2；真实打包产物、生产HTTP路由/应用bootstrap与隔离Harness SQLite，非Vite运行时假后端 |
| CONTROL | validate_refactoring.py --batch RF-066 / RF-068；validate_docs.py | exit0；后者DOC_VALIDATION=PASS metadata=754 links=243 |
| REGISTRY | run-registered-tests.cjs check | 109 registered / 105 CI-runnable / 2 governed-runtime / 2 historical-only；浏览器测试在前端自己的tests目录及独立选择器中 |

Browser插件/对应技能未提供，使用已安装Playwright Chromium后备；没有安装新浏览器。Node20.20.2运行隔离SQLite浏览器门，Node24.19.0运行合同门。测试监听OS分配的loopback端口；没有占用18790或启用旧代理代替生产接线。Quality另用已构建的/quality/入口复验，测试进程拦截其API为不可达，防止访问原Gateway；此项仅证明入口保留，不冒充Quality实时数据验收。

Foundation实际断言：原生1440×1000、窄屏390×844；页面非空；无框架覆盖层；Agent控制台error/warning均0、资源失败0、所有图标与本地字体加载；标题/正文/按钮/弹层的可见文字均14px/400/22px。深链接刷新三次bootstrap读、0次POST/执行；同源CSRF失效仅显式重连GET，未重放。无模型由隔离真实Repository空列表产生NOT_READY，未查询密钥/调用readiness或执行服务；403和网络断开只由浏览器测试进程注入，产品构建无fixture/mock分支。

### Visual evidence and fidelity ledger

证据根：`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s1`。保留figma-empty.png、figma-settings.png、agent-desktop.png、agent-settings.png、agent-narrow.png及foundation.json；均为本机文件，不能当作原演示环境已部署的证据。

| Comparison | Accepted Figma | Latest browser / disposition |
| --- | --- | --- |
| Layout | 248px侧栏、832px主输入列、720px三提示区 | computed 248/832；三个232px提示卡，输入列x428/y838；补回描述区28px高度，修正原3px垂直漂移 |
| Typography | Noto Sans SC Regular 14/22，所有节点同一字重 | 主屏及弹层逐节点computed 14px/400/22px；本地fontLoaded=true，无特别放大/加粗 |
| Palette | 背景#171b21、侧栏#12161c、表面#20262f、边框#343d49、品牌#A6192E | CSS锁定原值，背景实测rgb(23,27,33)；不加渐变/发光 |
| Assets | 已确认品牌及精确线性图标 | 直接用原favicon及Figma下载资产；无新绘制图标，实际渲染全部非空 |
| Spacing/container | 12px圆角、16px组件间隔、680px设置弹层 | 主屏对齐；设置沿同一三面板体系显示真实阻断详情，内容增长导致高度适应，不隐藏原因凑尺寸 |
| Responsive/interaction | 窄屏可关闭侧栏、输入区可见、键盘可操作 | 390px无横向溢出；AntD Drawer聚焦/退焦与Escape、Modal Escape、草稿填入均实测 |

已用view_image直接查看原生Figma空屏/设置及最后实图。首屏文案差异为已记录的S1边界：样例历史→尚未接入，样例用户→本机工作区，假READY→后台真实NOT_READY，样例模型→选择待接入，预览声明→“尚不执行测试”；移除未实现的更多菜单与发送快捷提示。其余主标题/副标题/三个业务提示及正文保持原意与顺序；所有增加说明用于消除假运行承诺。S1约定范围内的视觉实现已忠实核对，无剩余可修复的实质视觉差异；不声称历史/对话/配置完整界面已交付。

### Review and remaining gate

同一执行者完成另轮源码/反例复审，不冒充第二人独立审查。发现并修正：静态路由/产物名/品牌资源错接（归RF066）；JSON传输不应接收二进制合同；OFL未随产物携带；移动侧栏缺键盘约束；提示卡描述区高度；弹层浏览器检查过早按Escape。初次单测失败来自测试复用已消费的Response，已改为逐调用创建Response；初次浏览器等待失败来自入场动画尚未聚焦，已改为等待真实焦点，未增加重试或固定sleep。

原15个银行容器ID未变，均继续Up约32小时；未执行down/reset/restart、银行构建、迁移原库、改业务日期或Docker AI。18788/18789/18790未在本轮启用；只清理测试自有临时资源。未冻结身份、未调用BYOK或银行动作、未提交推送。S1源码/合同/隔离浏览器门闭合后解锁S2；S2–S5、原环境接入、LIVE、正式28项和整体GO均未因此完成。

## S2 implementation, verification and review — 2026-10-21

### Delivered

- UI-H01：真实createAgentConversation只登记空会话，收到id才导航。双击与响应式切换期间均锁定创建；若用户已选择其他路由，迟到回执不再导航。NOT_READY仍可登记空会话和读取历史，但无有效CSRF/403时不能新建。
- UI-H02：真实列表、Enter搜索、今天/昨天/更早分组、服务端nextCursor加载更多；按id区分同名记录。空历史、无结果、读取中、错误和显式重取各自展示；状态文字来自Harness，COMPLETED只写“已完成”，不写测试通过。
- UI-H03：真实最新消息页与before/nextMessageCursor前插，按消息id去重并保留原序和完整正文；布局提交后恢复阅读位置，读失败保留当前已读内容。后到的权威turn投影更新已有元数据，不在前端计算结果。
- UI-H04：BrowserRouter以/agent为基址，conversationId决定选中记录；刷新/前进后退/重新打开只GET。裸origin正规化为/agent/；404、403和503明确显示；查询/路由读取代次丢弃过期结果，手动重连不重放POST。新路由清除未提交草稿，不把正文写到URL、localStorage或sessionStorage。
- 组件为ConversationSidebar、ConversationHistory与实际使用的history辅助；既有生成API类型/路径保持不变。没有手写新DTO/API路径、前端账本、模型调用或执行接口；发送、附件、模型选择仍未开放。

### Actual checks

| Evidence level | Command | Result |
| --- | --- | --- |
| STATIC | 前端run lint / typecheck | exit0 |
| UNIT | npm --prefix apps/quality-case-portal run test | 32/32：原Quality16、Agent客户端11、历史辅助5 |
| BUILD | 同前缀run build / build:agent | 双输出exit0，原Quality仍独立；最终Agent主JS512.86kB/gzip166.93kB |
| CONTRACT | 同前缀run check:agent-api | AGENT_API=PASS；无OpenAPI变更 |
| CONTRACT | verify-agent-workbench.ps1 -Scope Contract | 18/18，原传输/CSRF/静态路由合同不退化 |
| INTEGRATION | 同入口-Scope Integration | 35/35：真实MCP/Harness、分页/namespace隔离、原绑定与恢复回读反例 |
| BROWSER | 同入口-Scope Browser -Case History | 1/1综合场景通过，真实MCP/Harness SQLite，不是前端Mock历史 |
| REGRESSION | 同入口-Scope Browser -Case Foundation | 2/2，含裸origin归一、基础样式/键盘/Quality独立入口 |

构建保留一条Vite主chunk超过默认500kB的体积提示；未提高阈值、不为消除提示扩大重构，本包不声称性能门通过。没有新增依赖、模型配置、后端API或数据库迁移。

History测试完整运行浏览器→同源生产HTTP/应用→生产MCP进程→临时Harness HTTP/SQLite。合成历史仅由测试进程经实际metadata写入口建立，另一namespace通过隔离Repository登记；测试完成后仅关闭自有进程/临时状态，未向保留环境播种。用旧绑定身份a×64和无默认模型产生真实NOT_READY，仍能读取已登记历史；不使用旧身份启动任务。

机器回读：37条会话可分页，同名两条不合并，24条消息完整、顺序一致、无重复，长Unicode正文与字面量标签保持完整；前插后可见锚点Y偏差≤1px。打开/刷新/切换/前进后退/新BrowserContext重开后，turn数15→15、runs数0→0；serviceFor派发0、原模型密钥读取0、执行POST0。一次显式新建在双击及桌面→窄屏切换期间始终只发1次POST；用户先选中记录后释放旧回执，浏览器history长度不增加。

还覆盖实际响应延迟后的快速切换、旧分页与旧搜索回执；503后保留已读列表/正文，只有手动重取；不存在及其他namespace的id均404。健康流无页面异常/非预期console error/warning；故障注入的预期资源错误单独识别，不冒充零错误网络。浏览器持久存储项数0，产品bundle不含测试fixture或错误拦截分支。

### Figma and browser review

沿用Full账户AGcoUj1UHujnoV0EPhvGLN的2:60原生完整上下文与1440×1000截图；复用原字体/品牌/已有图标，补取三枚message/clock/attention原始SVG，未改绘或引用临时URL。Browser插件未提供，沿用已安装Playwright Chromium；没有安装新浏览器。

| Comparison | Actual verified result |
| --- | --- |
| 布局与间距 | 侧栏248px、输入列832px、历史行72px，列表滚动区不侵入底部工作区；与已确认Figma一致 |
| 文字 | 新历史行/时间/搜索输入/正文均computed 14px、400、22px，无特殊标题字重 |
| 颜色 | 锁定原背景/表面/选中/边框；修正AntD暗色算法对新对话按钮的偏色，实际rgb(166,25,46) |
| 资产 | 三种状态图标按真实状态选择；所有可见本地图片已加载，原品牌/字体不替换 |
| 响应式与交互 | 390×844无横向溢出；Drawer展开结束后完整248px，搜索/选择自动关闭、焦点/键盘仍可操作 |

已用view_image核对Figma及最后桌面/窄屏/窄屏侧栏实图。与设计示例的有意差异：使用真实返回的合成测试记录及状态/时间，不植入“每日回归已安排”等样例；新增显式重读入口以覆盖故障恢复；本包只展示历史正文，不渲染S3的执行过程/结果卡；服务NOT_READY、模型未接入及无执行声明保持真实。没有未记录的实质视觉缺口。

证据根：`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s2`，保留figma-main.png、history-desktop.png、history-narrow.png、history-narrow-sidebar.png、history.json及foundation/回归截图。图片是隔离真实代码渲染，不是原环境部署或LIVE证据。

### Review disposition and remaining boundary

同一执行者另轮源码及反例复审，不冒充第二人独立审查。修正并复验：并行403/旧bootstrap覆盖CSRF、响应式卸载导致创建锁丢失、迟到创建回执重复导航、根路径基址不匹配、旧响应覆盖新选择、消息前插位置与权威turn更新、创建按钮loading时可访问名称改变。初次History验证因测试MCP URL缺/mcp被既有边界明确拒绝，修正测试入口而未放宽生产校验；后续反例发现loading图标改变按钮名称，补稳定aria-label/testid；窄屏截图等待动画结束，不用固定sleep或重试掩盖。

S2源码、合同、隔离集成、浏览器与复审门已闭合。原15个银行容器ID未变、继续Up约36小时；原18788/18789/18790未启用，原库、卷、业务日期、Docker AI未操作；无提交/推送、冻结或真实BYOK调用。S3只解锁，不在本包执行。完整生产接入、后台重启后的前后端贯通、真实模型与整体发布判定仍归S5及现有正式门，不能由本轮提升为LIVE或GO。

收尾控制回执：RF-068治理与docs实际均exit0，REFACTOR_VALIDATION=PASS、DOC_VALIDATION=PASS metadata=754 links=243。打包JS精确检查未发现History测试fixture/合成记录/测试MCP令牌标记，S2_PRODUCT_BUNDLE_TEST_MARKERS=ABSENT；git diff --check退出0。随后将S2置DONE、S3置READY，RF068总包保持IN_PROGRESS；最终同步再执行相同治理/docs检查，不将其当作新的运行证明。

## S3 implementation, verification and review — 2026-10-22

### Implemented behavior

ConversationView编排生成客户端，Composer负责输入、IME/键盘和单图预览，TurnProgress展示安全事件摘要，EvidenceDrawer只读获取/下载。未修改Controller、Harness、数据库或公开API；不引入模型调用、工具编排或第二账本到React。

- UI-C01：根输入可先登记会话并提交目标；同步发送锁、每个意图一个submissionId。未知回执先GET原会话，不按相似文本猜归属，不自动新id重发；只有显式“核对原提交”才先读后以原id/原载荷核对。原请求服务端登记过时不会再执行。创建后明确拒绝保留原空会话供继续使用，离开页面后不因迟到回执跳转。
- UI-C02/C03：仅当前会话最新任务定时GET，after/limit按sequence合并，终态排空hasMoreEvents。读失败停止自动读取，手动重读不重派执行；历史事件只在展开时分页读取。NEEDS_INPUT展示实际问题，补充沿用原profileId/version/Journey；COMPLETED仍区分回复完成、TEST/PASSED及未核验。过程只展示受限计划/工具摘要，不展示私有推理或完整参数。
- UI-C04：停止同步锁、202仅显示STOP_REQUESTED，随后GET原任务。INTERRUPTED保留失败码与人工核对提示，不声称撤销/回滚，不自动重跑。
- UI-C05：单张PNG/JPEG实际二进制导入，UTF-8文件名按冻结header编码；只把安全回执加入提交。坏类型/上传失败无messages POST；移除、替换、成功与卸载释放预览URL，下载URL亦释放。
- UI-C06：Turn/Journey/Run/Task/ReleaseIdentity来自权威投影；抽屉经同源受控代理下载，缺失/无权/隔离明确失败，无service token、grant URL或服务端路径。S4未实施，当前只读默认模型安全元数据，不开放选择/配置按钮；缺输入使用原任务模型。

### Commands and actual receipts

| Level | Actual command | Result |
| --- | --- | --- |
| STATIC / UNIT | npm --prefix apps/quality-case-portal run lint / typecheck / test | exit0；38/38，Quality16、客户端13、历史5、Turn4 |
| BUILD / CONTRACT | 同前缀run build / build:agent / check:agent-api | 双构建通过，AGENT_API=PASS；Quality产物独立 |
| CONTRACT | powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1 -Scope Contract | 18/18；生成合同及HTTP边界保持 |
| INTEGRATION | 同入口-Scope Integration | 35/35；实际Controller缺输入、MCP、Harness/SQLite及证据代理边界，不等于BYOK |
| BROWSER | 同入口-Scope Browser -Case Conversation | 1/1综合场景通过，最终21.531秒；没有降低断言 |
| REGRESSION | 同入口-Scope Browser -Case History / Foundation | History1/1（9.428秒）、Foundation2/2（6.693秒），真实历史与Quality独立入口保持 |

Browser使用已安装Playwright Chromium（会话未提供Browser插件/skill），未安装依赖或浏览器。入口为测试HTTP实际返回的OS分配loopback origin，非18790原环境；1440×1000及390×844。路径为打包/agent → 生产HTTP/application → 独立真实MCP → 临时Harness/SQLite。仅测试进程的模型、执行器和工件源为合成替身；PNG/JPEG实际走生产importer进入隔离Harness，下载验证实际取得的字节。原环境未播种、真实模型/银行操作为0。

最终conversation.json回读：10次messages POST包含一次同id原载荷核对；共10条turn包含一条直接建立的普通回复反例。测试替身start7次/原Journey续接1次，缺启动信息及缺金额/收款人时无资金动作；同id核对没有额外start。68条分页事件无重复且有序；真实PNG与浏览器截图JPEG各导入一次。上传失败、PDF拒绝无悬空提交；工件正常下载字节相等、隔离工件403不能下载。状态503后快进5秒仍只1次失败读取，显式重读恢复。停止双击只有1次cancel POST，STOP_REQUESTED后INTERRUPTED，刷新不增加start。普通回复不显示测试通过；持久存储项数0，非预期page/console error及warning均0。

证据根：`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s3`；包含figma-running.png、conversation-completed.png、conversation-running.png、conversation-failed.png、conversation-evidence.png、conversation-narrow.png及conversation.json。早轮失败截图单独保留，不覆写为通过。最终History回执在本机临时rf068-s2-browser-QgAKBd，Foundation在rf068-s1-browser-MmzeRD。

### Figma fidelity and review

按Full账户原生2:62/63/64、6:885完整上下文与截图实施，未重新生图。复用现有品牌、字体及匹配图标；新增七枚原始Figma SVG，本地文件非空、根尺寸核对，未绘制替代图标或引用临时URL。已用view_image查看Figma原生1440×1000和最后桌面/窄屏实图；运行中当前任务在可见滚动区有机器断言。

| Comparison | Actual disposition |
| --- | --- |
| 布局/几何 | 原248px侧栏、832px输入列、788pxAgent结果区保持；证据抽屉404px，移动端不横向溢出 |
| 字体 | 新结果/引用/输入/模型文字computed 14px/400/22px；无特殊加粗/放大 |
| 配色/圆角 | 原#171b21/#12161c/#20262f/#343d49/#A6192E及12px圆角，不加新渐变/阴影 |
| 图标/状态 | 精确停止/下载/文件/展开/成功及灰/黄时钟，原品牌与本地Noto/OFL保留 |
| 信息密度/交互 | 三项最近真实事件＋展开完整工具事件，不虚构业务三步；显式发送定位、底部自动跟随、翻页锚点、下载焦点恢复及Escape可用 |

文案有意差异：Figma示例模型/金额/余额/关联号不植入；现有合同没有浏览器实时查看、余额字段或Correlation时不造按钮/数值。只显示真实返回的引用、状态、失败码和证据；“设计预览”页脚换成实际能力边界，S4模型选择/配置仍未开放。新增提示仅用于缺输入、未知回执及未核验事实，不承诺调度已创建或银行已成功。除已记录的数据/能力边界差异外，本包所实现视图的字体、颜色、资产和布局已忠实核对。

同一执行者另轮源码、反例及截图复审，不冒充第二人独立审查。实际修复：旧版本事件页覆盖新状态/遗漏事件；摘要覆盖完整turn字段；无回复任务被集中放在历史底部导致顺序错位；刷新占位22px改变锚点；长任务及窄屏仍停在上一结果；历史未加载事件被误写为0；下载后焦点丢失；两字AntD按钮可访问名称变化。初轮另有夹具非art_UUID、测试在当前终态之前点击证据、普通Error不属于公开WorkbenchError等错误，均修夹具/等待条件，未放宽生产校验。History的延迟注入改为只拦一次目标响应并加入测试截止，避免同时拦住新背景回读；保留原1px锚点断言。

Agent主JS530.13kB/gzip172.16kB保留原Vite>500kB提示，未提高阈值或为告警清零扩展重构，不宣称性能门通过。原15个银行容器ID相同、最终均Up（有健康检查的均健康）；本包未发Docker启停/重建命令，不以结束健康证明全过程不间断。无原库迁移、卷/业务日期/Docker AI操作、真实BYOK、身份冻结、提交或推送。S3完成后仅解锁S4；原环境联验与BYOK归S5，正式28项与整体GO不变。

收尾实际控制回执：RF068治理与docs均exit0，REFACTOR_VALIDATION=PASS、DOC_VALIDATION=PASS metadata=754 links=243；scoped git diff --check退出0，S3_PRODUCT_TEST_MARKERS=ABSENT；既有测试登记109项完整（105 CI-runnable/2 governed-runtime/2 historical-only），不冒充Conversation已由远端CI执行。源码/截图/反例复审后登记S3 DONE、S4 READY，总包仍IN_PROGRESS；同步后再校验控制文件，不额外声称新的运行证据。

## S4 implementation, verification and review — 2026-10-22

### Scope and implementation

S3已完成后执行UI-M01–M05。基线main@552b3b8，保留全部既有脏工作区；仅修改前端、Models浏览器用例、既有验证入口与RF068控制/证据文件，没有修改后台、合同、迁移、银行代码或服务配置。

- App/useModels统一读取生成客户端的安全模型目录；ModelPicker仅在页面内存保存待提交id/version，菜单选择不调用默认设置。旧选择版本已变化时明确不可用，停止新提交，要求手动选择，不暗升版本或回退默认。
- /agent/models提供ModelConfiguration，字段限显示名称、模型ID、Base URL、API Key；配置页返回原会话，直达/刷新等待bootstrap及目录后载入已有配置。密钥不回读，以空值及“已配置，留空保持”表示；离页卸载临时输入，不写URL、浏览器持久存储或日志。
- 检查只调用当前表单端点及明确的新密钥/旧profile版本；失败显示安全码，无重试或模型切换。检查、保存、默认设置、执行READY是不同事实。
- 保存调用create/update并带旧version，再显式设置默认；同步锁拒绝双击重复提交。更新409重载而不覆盖；默认设置409显示已保存与冲突事实；保存成功但默认503保留保存结果，只有显式“设为默认”重试该步骤，不再创建/更新一次。
- 当前RUNNING/NEEDS_INPUT在输入框下方显示原model/version。改下一模型及保存配置不修改当前turn；补输入仍提交原profileId/version、同Journey，终态后的新目标才采用新选择。设置仅保留服务状态、身份、模型入口和只读Quality链接；不承诺新身份LIVE授权。

### Commands and receipts

| Level | Command | Actual result |
| --- | --- | --- |
| STATIC / UNIT | npm --prefix apps/quality-case-portal run lint / typecheck / test | exit0；41/41，Quality16、客户端13、历史5、Turn4、模型选择3 |
| BUILD / CONTRACT | 同前缀run build / build:agent / check:agent-api | Quality与Agent独立构建通过，AGENT_API=PASS |
| CONTRACT | powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1 -Scope Contract | 18/18，冻结HTTP合同无变更 |
| INTEGRATION | 同入口-Scope Integration | 35/35，包括CurrentUser DPAPI、空密钥保持及原版本绑定；隔离证据，不是实机BYOK |
| BROWSER | 同入口-Scope Browser -Case Models | 1/1综合场景，最终18.133秒 |
| REGRESSION | 同入口-Scope Browser -Case Foundation / History / Conversation | 2/2、1/1、1/1；最终分别6.842秒、10.927秒、22.142秒（测试本体） |
| CONTROL | python scripts/architecture/validate_refactoring.py --batch RF-068；python scripts/docs/validate_docs.py | PASS，metadata754/links243；scoped git diff --check exit0 |

使用既有Playwright Chromium：Browser插件/skill在当前会话不可用（Browser plugin not available），未安装依赖或浏览器。Models最终入口http://127.0.0.1:65518/agent/及/agent/models（测试OS动态端口，以models.json最终origin为准）；生产HTTP/application→真实独立MCP→临时Harness SQLite。仅模型探测、执行器和密钥源在测试进程中使用合成替身，无实际模型/银行调用。原配置密钥未读取，未录制密钥请求trace。

Models反例覆盖：空目录/NOT_READY引导；检查失败/成功均不保存；双击仅创建一次；离页清空密钥及刷新读取已有配置；空密钥不新增keyRef；旧版本更新409不覆盖且旧选择不可新提交；保存后默认503的显式单步骤重试；默认409重载；原会话返回；NEEDS_INPUT在甲v3期间保存甲v4并选择乙v2，续接仍甲v3；运行乙v2时选择甲v4不改变当前绑定，下一个新任务才用甲v4。四次显式检查、三次start及一次同Journey续接，实际银行动作0。local/sessionStorage项数0，URL/history/安全目录/会话投影无合成密钥，非预期pageerror/console error/warning均0。

### Browser and fidelity review

目标流：/agent/ → 下方模型菜单 → /agent/models → 检查/保存/冲突 → 返回原会话 → 原绑定续接/下一新任务。1440×1000原生设计尺寸及390×844验证；窄屏表单可滚动到底部检查与保存，不横向溢出。标题、非空内容、无框架overlay、console健康、截图及交互六项均通过。截图根：`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s4`，含figma-models.png、figma-menu.png、models-config.png、models-menu.png、models-narrow.png、models-narrow-actions.png及models.json。

Figma Full账户原生12:1201、11:1017及2:65上下文/截图重新提取，初次两个节点传输失败后显式重取成功，未以猜测截图替代。沿用既有资产，新增两枚精确Figma SVG（灰色选中、添加）；文件非空、源24×24不修改，在16px设计槽缩放，未引用临时资产URL。已用view_image核对原生设计和最后桌面/菜单/移动端截图。

| Comparison point | Result / disposition |
| --- | --- |
| 布局与容器 | 248px侧栏、配置列表240px、表单832px、24px间距，菜单320px；修复portal缺box-sizing导致的宽/高膨胀 |
| 字体 | 表单标题/正文/label/input/button实测全为14px/400/22px，菜单同字体；不特殊放大加粗 |
| 配色和圆角 | #171b21/#12161c/#20262f/#262e39/#343d49及品牌#A6192E，12px容器；保存按钮使用既定品牌色 |
| 资产 | 选中不再借用S3绿色成功图标，使用Figma原灰色资产；展开/设置/添加均本地真实SVG，图像加载通过 |
| 文案与交互 | 保留四字段、协议、检查与保存主操作；真实目录替换示例模型，空密钥文字代替伪圆点；键盘开关菜单/Escape及配置返回均通过 |

Above-the-fold文案差异为有意的运行事实：不植入GPT示例、假历史、示例头像或“设计预览”；页脚显示检查/保存/READY/LIVE边界，冲突和部分失败提示只在对应事实出现。没有增加业务管理入口或伪造就绪状态。除这些已记录的数据/能力差异外，本包模型配置与菜单已按批准设计忠实核对，无未处理的范围内视觉缺陷。

同一执行者另轮源码与反例复审，不冒充第二人独立审查。修复直接刷新早于目录初始化、默认阶段冲突后丢失新建profile选中、辅助文案污染输入可访问名称、portal盒模型与选中图标不一致。测试初轮失败还包括合成Run/Task引用短于既有合同、在Controller开始前断言绑定，以及AntD过渡期截图；修夹具/等待权威回执与实际稳定状态，未放宽生产校验或用固定sleep/重试掩盖失败。失败截图不作通过证据。

Agent主JS654.29kB/gzip211.78kB仍有Vite>500kB提示；没有提高阈值或为清零扩大重构，也不声称性能验收通过。既有测试登记109项完整（105 CI/2 governed-runtime/2 historical-only）；Models走专用Browser选择器，不冒充远端CI执行。产品JS未含合成模型/密钥/MCP测试标记，S4_PRODUCT_TEST_MARKERS=ABSENT。

原15个项目容器ID与开工一致，结束均Up，有健康检查者健康。本包没有Docker启停/替换、原库/卷/日期/Docker AI操作或生产18790切流；其他项目同期新容器不属本包，保持不动。无真实BYOK、冻结、提交/推送或GO结论。源码、隔离验证及复审闭合后S4 DONE，仅解锁S5；实机BYOK、正式28项和整体GO仍按原门执行。

## S5 entry inspection — 2026-10-22

Outcome: BLOCKED_BEFORE_LIVE。本次只读核对与控制记录，不是S5通过，也不是一次业务测试失败。

- Git根`D:/Agent/banksystem`，main@552b3b8ac517bd5991bff446e72d9f4e87ea9543，保留全部脏/未跟踪文件。S1–S4仍为DONE，S5由READY登记为BLOCKED，总包保持IN_PROGRESS。
- 通过既有`environmentWithRuntimeFile`在进程内部加载配置，只输出配置存在布尔值，不读取到对话或打印密钥。`currentReleaseIdentityV4`与`authorizedIdentity`当前回执：identity=`5fc8fcd473092200529dc006f211a9e84d2ce2e526b06213ea6e6c4b8edadd95`，authorizationMatchesCurrentIdentity=false；模型名称、端点、密钥、MCP地址/令牌、service token、sessionRoot与namespace均存在。
- 既有`managedStatus({root,identity})`返回NOT_RUNNING/healthy=false；历史登记harness PID22100、mcp PID36728、worker PID41592均owned/current/healthy=false。该结果仅证明当前身份无健康托管组合，不据此终止PID或断言未知进程的性质。
- 全局端口注册表的18788/18789/18790仍属于本项目；本次这些端口未发现Windows TCP监听。没有新登记、启动、重载、迁移、备份或读取原库。原15个银行容器均Up，有健康检查者健康；ID与S4相同。Docker AI、数据卷及业务日期不动。
- 源码确认`verify-agent-workbench.ps1`已有四个单项Browser入口，但Browser/All与LiveReadOnly仍明确NOT_IMPLEMENTED。`agent-workbench.ps1`存在精确PID归属检查；真实生产组合保留当前身份授权和托管运行门。这些缺口未由S4的隔离通过替代。
- 本次STATIC仅为源码/元数据核对；未重跑前端、CONTRACT、INTEGRATION或BROWSER；LIVE_E2E=NOT_RUN，真实模型调用0、银行动作0。S4既有证据完整保留，不复制成S5的新回执；无冻结、提交、推送或GO。

停止原因是新身份授权边界，而非模型配置缺失或已确认的银行故障。需明确授权当前身份绑定与真实BYOK只读验收；授权后重新计算身份，先完成验收入口和非LIVE前置门，安全核对托管进程/无活跃任务/迁移备份，再进入真实只读业务链。不得把普通开始任务指令自动写成identity授权环境值，亦不恢复逐提案人工审批。若后续修改影响身份，先固定最终源码再处理授权，不借旧身份执行。

## S5 authorized freeze, startup and first LIVE failure — 2026-10-22

Outcome: BLOCKED_AFTER_FIRST_LIVE_FAILURE。用户明确授权新身份冻结、托管启动及真实BYOK银行只读验收，保持原银行服务；前述授权阻塞已解除。本节记录新尝试，不改写上节历史回执或失败报告。

### Entry implementation and pre-LIVE receipts

既有verify-agent-workbench.ps1补齐Browser/All，依次执行Foundation、History、Conversation、Models；任一非零立即停止。LiveReadOnly调用scripts/test/rf068-workbench-live.mjs。scripts/demo/rf068-workbench-runtime.cjs只负责精确身份、聚合活跃计数、SQLite备份和既有lifecycle启动；未改生产后台、合同、数据库迁移或前端源文件。真实验收驱动不引入模型/Worker替身、依赖安装或自动重发，失败仅收取本次Agent截图并关闭自己创建的浏览器，不关闭服务。

| Evidence level | Actual command / scope | Result |
| --- | --- | --- |
| STATIC / UNIT | apps/quality-case-portal的lint、typecheck、test | exit0，41/41 |
| BUILD | 同目录build、build:agent及生成客户端检查 | exit0，双入口独立；AGENT_API=PASS |
| CONTRACT | verify-agent-workbench.ps1 -Scope Contract | exit0，18/18 |
| INTEGRATION | 同入口-Scope Integration | exit0，35/35；Controller缺输入、真实MCP/临时SQLite、DPAPI边界；不是BYOK执行 |
| BROWSER | 同入口-Scope Browser -Case All | exit0，共5项：Foundation2、History1、Conversation1、Models1；ISOLATED_BROWSER |
| CONTROL | RF066/RF067/RF068治理及docs | 前置均PASS，docs metadata754/links243；范围内diff检查exit0 |
| LIVE_E2E | 同入口-Scope LiveReadOnly | exit4，首次实际提交失败，后续验收停止 |

Browser反例仍覆盖去重/并发、丢响应、旧版本、停止、旧身份历史、密钥和Quality只读；模型/执行器替身仅限隔离测试进程，不计实机通过。当前截图与JSON在本机可视化目录rf068-s5的foundation/history/conversation/models子目录。Figma Full账户原生2:60/62/63/64与6:885截图已获取；2:64实际为完成态，不因早先临时命名而作为失败态参照。已查看运行态与真实失败截图；因本次LIVE提前停止，不声称S5全部视图、窄屏、配置和结果的实机设计验收完成。

Agent主JS654.29kB/gzip211.78kB仍保留Vite>500kB版本级提示，未放宽阈值、扩大重构或记为性能通过。

### Frozen identity and managed startup

- ReleaseIdentity：`5fc8fcd473092200529dc006f211a9e84d2ce2e526b06213ea6e6c4b8edadd95`，源码基线main@552b3b8ac517bd5991bff446e72d9f4e87ea9543加冻结摘要中的当前脏源码/构建/合同。未提交或推送。
- 显式身份启动命令：pinned Node20执行scripts/demo/rf068-workbench-runtime.cjs start与上述完整身份。freeze.json另绑定本次三个验收/启动脚本SHA256；没有为此扩大生产身份清单。
- 原库启动前tasks/runs/action_plans/i8_candidate_build_jobs/workbench_turns活跃数及ACTIVE schedules均0；历史三个PID均已不存在，才移除失效托管登记。不终止未知进程。
- SQLite一致性备份：产品根`.data/sqlite/offline-backups/rf068-s5-3b465498-1c3e-40e9-a2b2-a45722fb1c7f.sqlite`，完整性ok，SHA256=`c40d44cee37ff1ca7ed56f1da44d072200461002ea1cdb5335555b3ca55802e0`。启动回执根`.data/rf068-s5/9edfac63-282e-4d6c-a455-b76b6b77a10d`；本地恢复配置含凭据，不读取到报告、不提交。
- 原Harness以既有迁移机制从43到44；启动后actual/expected=44/44，聚合活跃数0。Harness PID58648、MCP39868、Worker17444均owned/current/healthy；Agent web通过既有agent-workbench.ps1启动PID45664，loopback18790。
- 已同步全局端口注册表18788/18789/18790的本项目精确记录；没有修改其他项目。原15个银行容器ID保持、均Up，有健康检查者健康；未发Docker启停/重建、卷/日期/Docker AI操作。

### Actual LIVE trace and stop boundary

唯一实际尝试：`agent/runs/rf068-s5/f5671eef-9955-4dd0-a855-4e0d9ac17239/report.json`，startedAt=`2026-10-22T14:27:01.473Z`（北京时间22:27）。status=FAILED、stage=BYOK_READ_ONLY_EXECUTION、code=AGENT_MANAGED_RUNTIME_NOT_READY、stoppedAfterFirstFailure=true、humanInterventionRequired=true。

- 真实/agent页面bootstrap曾READY，实际BYOK端点就绪探测通过；不能据此声称Agent已经执行银行目标，也不能声称本轮模型调用为0。
- 在独立浏览器上下文通过真实Keycloak PKCE登录既有合成演示客户，以Gateway GET读取两账户及流水，获得before摘要`9bd4d50e4116ff96afdd775161f3ea157d2bfb08cd5f8c5929fcb6632da2090d`。凭据只在可信驱动内使用，模型/报告无明文密码或token。原客户凭据登记为Harness DPAPI引用，没有新建银行客户、播种、转账或业务写请求。
- 新会话`d97c1382-1afd-4e96-93f6-8f31b810d349`先经真实缺输入门NEEDS_INPUT，再由页面补充明确只读目标。失败turn=`fe2cbb47-3a25-4398-8b81-dc83a4358693`，绑定默认profile v1、deepseek-v4-flash和当前身份；API基址仅保留摘要。
- workbench-application.execute的readiness先于PLANNING/serviceFor/start；本次在managedStatus门返回失败，因此没有Journey/Run/Task引用，也没有Worker银行操作。失败已在真实页面显示，截图live-main.png、live-needs-input.png、live-first-failure.png随原报告保留。
- 未执行成功结果/工件摘要/Quality一致性、实机网页重启不重放、最终银行快照及后续窄屏/配置交互验收；没有after摘要，不把before一张快照写成完整只读不变量通过。关闭的是本驱动浏览器，四项托管/网页服务与银行服务均保留。

### Read-only root-cause review and next repair gate

另轮只读复审以源码顺序与反例为依据，由同一执行者完成，不冒充第二人复审。没有重复POST、再次doctor/model调用或后续业务测试；只读取健康端点、进程归属和SQLite quick_check。

| Finding | Evidence / certainty |
| --- | --- |
| 最早失败边界已定位 | workbench-production.readiness将managed.healthy=false折叠为AGENT_MANAGED_RUNTIME_NOT_READY；Controller尚未派发，不归因银行业务或模型生成 |
| Harness短健康门可误判正常响应 | lifecycle的httpOk固定1500ms、调用完整/health；只读managedStatus三次为NOT_RUNNING/HEALTHY/HEALTHY，唯一失败项为Harness healthy=false，owned/current始终true，MCP/Worker正常 |
| 超时条件实测复现 | 四次单独HTTP GET的Harness首字节为2269/458/455/466ms，均最终200；MCP为2/1/1/1ms。2269ms超过1500ms，不依赖再次提交业务 |
| 深检成本存在，非全部延迟已解释 | /health同步migrationStatus、Worker代码集及quick_check；只读原库三次quick_check为381/375/364ms，结果均ok，33文件代码集36/19/18ms。剩余排队/事件循环/磁盘延迟未单独证明，不把所有2269ms归咎SQLite，不声称数据库损坏 |
| 不成立的归因 | 无PID占用/源漂移/Worker代码集不一致证据；健康恢复不抹除失败。Worker健康文件采用临时文件替换，不能无证据指为半写JSON |

后续最小修复入口归RF066托管就绪接线；如改变Harness完整深检职责，再登记RF067所属范围。先从上述已观测失败出发梳理重复的短存活检查与完整产品就绪检查，保留进程归属、真实模型、迁移、SQLite、Worker代码集和银行健康门；安全失败回执保留组件及明确原因。以慢但正常响应、真实不可用、旧PID/旧身份反例证明语义，不加隐藏重试、备用路径、静默放行或仅放大一个超时掩盖全部问题。该后台修复本轮未实施，S5也未越权修改后台。

完成所属包源码修复及隔离回归后，冻结新身份、核对LIVE授权，再从S5实机清单起点重测，原失败证据不改写。当前S5=BLOCKED、RF068总包=IN_PROGRESS；正式28项、远端CI与整体GO均未由本轮提升。

## 2026-10-23 — S5完整源码审查、隔离反例与成组修复方案

用户要求了解完整S5、查验代码、测试并形成一次性修复方案，允许充分投入。本轮完成上述审查与方案，不提前把诊断请求解释成已修复产品。方案见[S5-repair-plan-20261023.md](S5-repair-plan-20261023.md)，含UI-A01–A05映射、逐条根因、五组微观步骤、所属路径、完成门与统一复验入口。

### 当前现场

`docker ps`返回Docker Desktop Linux引擎管道不存在；`Get-NetTCPConnection -State Listen -LocalPort 18788,18789,18790`未发现监听。上一节的原15容器/托管PID运行状态仅指2026-10-22，不作为今日证据。本轮未启停原服务、未访问银行业务或真实模型、未改卷/日期/Docker AI，未读取凭据正文。测试只使用隔离SQLite及自己创建并清理的进程。

### 已执行验证

| 范围 | 实际结果 | 解释 |
| --- | --- | --- |
| Contract | 18/18，生成API检查通过 | 既有边界合同 |
| Integration | 35/35 | 真实隔离MCP/临时SQLite、DPAPI；不是真模型 |
| 前端unit | 41/41，5文件 | 当前前端回归 |
| build:agent | exit0，类型与AGENT_API通过 | 保留主JS654.29kB提示；本轮未将它列为性能完成 |
| Browser/All | 5/5 | Foundation2、History1、Conversation1、Models1；临时服务与测试替身 |
| CLI专项回归 | 49/49，约39.97秒 | release-lifecycle、journey-author-validate、journey-execute、journey-evidence-verify四套；锁定Node24 |
| 新反例第一组 | 1通过、5失败，约3.18秒 | 锁定Node20，实际源码/HTTP/SQL/应用配合合成边界，不改生产源 |
| 新反例增量组 | 3失败，6项未重复执行，约1.87秒 | 只执行新增R07–R09；合计9个不同反例，1通过/8失败 |
| LIVE_E2E | NOT_RUN | 今日环境不具备；原首次失败仍保留，不追加为通过 |

通过套件与新增失败反例并列报告，不以旧套件全绿抵消新缺陷。R01慢200误判、R02原因被折叠、R04 CLI非零终态丢失、R06 inspect被启动保护拦截、R07无法取消readiness属于实现问题；R05限长列表不重放谓词、R08缺少Agent账户目标事实、R09三入口缺身份覆盖属于验收/身份缺口。**R03实际停止竞态测试通过：dispatch=0，状态机有效；没有证据支持“停止后仍会派发”。**

原生审计文件与TAP位于：

`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s5-audit-20261023/`

文件为`s5-counterexamples.cjs`、`counterexamples.tap`、`counterexamples-additional.tap`；浏览器截图/JSON在`browser/foundation`、`browser/history`、`browser/conversation`、`browser/models`。已查看窄屏失败态；隔离图不能提升为真实银行执行画面。审计脚本仅用于发现缺口，修复时迁入所属正式套件并移除本机路径/AST提取，不纳入运行产品。

### 本轮控制修正与未完成项

同步唯一顺序中的过时“未授权/模型调用0”描述、verification-plan中Models/All/LiveReadOnly未实现描述；S5完成谓词区分turn的PASSED与独立proof的VERIFIED。backlog仍BLOCKED，仅增加本方案证据引用；不倒改历史失败、已完成隔离任务或其他批次结论。

产品修复尚未实施。按方案成组修完、所属回归通过后才能冻结新H并重跑完整S5；不冻结身份、不运行正式28项、不声称整体GO。

本轮文档落盘后，RF066/RF067/RF068三个`validate_refactoring.py --batch`均exit0/PASS；`python scripts/docs/validate_docs.py`为PASS，metadata=755、links=249、order_files=766，范围LOCAL_EVIDENCE。此校验只证明控制与文档结构，不代表源码修复或运行验收通过。

## 2026-10-23 — 五组修复获批执行与当前验收门

2026-10-26最终集中结果：本轮7项新修复，附加安全模型诊断；专项115、作者化15、CLI50、Contract19＋12、Integration41＋runtime2通过。5次新身份真实复测后，H4e6df193…fef2e1报告7dabe00e在草案阶段以JSON_SYNTAX失败，无Journey/Run/Task；S5仍BLOCKED，后续完整银行前后/证据/历史/重启门未跑。一次协议探测合法JSON仅作诊断，不能覆盖失败。[详细回执及剩余门](S5-semantic-repair-20261026.md)。原银行及Agent保持运行，下方为过程和历史。

2026-10-26新一轮：[语义修复回执](S5-semantic-repair-20261026.md)。D01–D05独立反例先红后绿，D06现场过期PID问题修复；编译/Worker115、Contract19＋11、Integration41＋runtime2、CLI50通过。新H1fb11e2a…84a680冻结并安全启动，正在S5真实只读验收。旧7项不重复计数，当前S5/正式28项/GO不提前提升。下方为历史结果。

本轮最终集中结论：完成C01–C06及C08共7项修复，C07语义字段绑定尚未收口、不计完成。6次新身份真实复测后，最终H3301077e…dcbb33报告5c3e2b09因“账户标识/账号”的视觉文字匹配失败；S5保持BLOCKED，bankAfter及后续回读门NOT_RUN。三组件及网页运行、银行服务不动。当前完整证据/剩余修法见[连续修复回执](S5-continuous-repair-20261024.md)，下方均为阶段历史。

2026-10-24连续修复更新：[本轮回执](S5-continuous-repair-20261024.md)覆盖5个编译反例、2个消费接缝及真实身份页提交误拒；反例先红后绿、编译/Worker108、CLI50、Contract19＋11、Integration41＋1及控制/docs通过。H5541e30b实机已走通SSO/身份页/凭据填写，提交按钮误拒的失败报告封存；继续修复后Hc52dddd9已冻结并在原银行保留情况下从S5起点复测。下方旧“首错停止”只描述历史单次报告，不代表最新用户要求结束本轮；不把隔离门提升为S5/正式28项/GO。

最新本轮：登录语义误拒已[修复/测试/复审](S5-login-match-repair-20261024.md)，Worker61、Contract19＋11、Integration41＋1、CLI76通过；冻结H7a722b08…525239后真实S5报告0d72ea26在首个确定性失败停止。新根因为Harness未将“Keycloak身份认证”展开，goto后直接查找账户导航；原修复点本轮未执行到。详见[新根因](S5-live-root-cause-20261024-03.md)。原银行及Agent服务保持，S5仍BLOCKED；下方均为此前历史。

当前最新结果：2026-10-24 H618b078b…93c129已冻结/启动，报告ae132adb-4036-4130-9cd6-b263029bc797在首个确定性失败I10_MIDSCENE_LOCATOR_MISMATCH后停止。视觉选中正确SSO按钮，Worker把动作整句与按钮标签做字面匹配而误拒；仅一次定位、具体码已回传、正式runs为空。S5仍BLOCKED，原银行及新Agent服务运行。详见[本次根因](S5-live-root-cause-20261024-02.md)。下文工具启动拒绝和模型不支持均为历史结果。

最新补充：2026-10-24原银行恢复、同一H无漂移后，首次LIVE在候选创作定位SSO入口时失败；具体原因I10_MIDSCENE_TARGET_NOT_FOUND被MCP投影丢失，顶层仅JOURNEY_EXECUTION_FAILED。已停止后续验收，服务保持运行，S5仍BLOCKED。报告778e3726-d0ec-4a9e-945d-4ae653b30327及源码根因/待确认项见[执行回执的2026-10-24记录](S5-repair-execution-20261023.md)。下文环境阻塞是此前历史状态。

后续定点根因已确认：三份SDK原始错误均为`400 Unsupported model mimo-v2.5`，被SDK包装及Worker误分类为目标未找到；不是已证实的页面定位缺陷。另有Worker外层重复3次、doctor未覆盖视觉能力、MCP丢失error。离线分类回放复现，未发新LIVE；修正方向与证据见同一执行回执的“定点复查”节。

专项修复执行：已明确选择mimo-v2.6-flash，实际SDK合成定位及生产doctor视觉子进程均READY；分类、首错停止、MCP/turn/UI错误传播及视觉身份绑定已修。Contract19＋11、Integration41＋1、Worker59、CLI76、前端45、Browser5及双构建通过。候选H618b078b…93c129；旧Agent进程已不存在，银行仍healthy。原托管启动命令被工具自动审批以blocked by policy拒绝，未完成运行冻结/启动，未进入新身份LIVE。S5保持BLOCKED；详见[专项执行回执](S5-repair-execution-20261023.md)。

用户后续授权的[策略排查清单](../../../project-policy-inventory-20261024.md)已完成：取消/简化8类机械治理阻挡，保留实际批次范围/身份/进程/持久化/资金保护。预算回归3/3，Ajv2020 schema正反例6项及3批结构通过，三批治理/docs通过。本机规则文件无deny，不能据此定位或取消工具层的blocked by policy；未修改全局配置、未绕过拒绝或重新启动/LIVE，S5仍BLOCKED。

完整回执：[S5-repair-execution-20261023.md](S5-repair-execution-20261023.md)。RP01–RP04源码修复和RP05前置回归完成；Contract19＋专项9、Integration39＋runtime1、前端44、CLI75、Browser5、双构建及三批治理/docs通过。失败反例已迁入正式套件，不用审计脚本的AST提取作产品验收；另有仓外真实AccountList/Worker采集契合检查，合成数据，明确为ISOLATED_RENDERER_CONTRACT。

最终身份`0d9a22b1d5c40a61cf414e094c34d75303709ee080bdca8845d4f1b8e54ba196`在源码/构建收口之后冻结。原库一致性备份SHA256=`fe1801289ab2b48e4c0268253f77980ce74fafd932d2803a6f8fdf57af4d037d`；回执根`.data/rf068-s5/b0143bc6-3a1f-4768-9722-59100450361f`。Harness53836/MCP74088/Worker73944为owned/current/healthy；Agent web44124为自有、静态HTTP200；44/44迁移、六种活跃聚合值0。原18788–18790登记已更新，仅改本项目行。

真实验收为BLOCKED_BEFORE_LIVE：desktop-linux/default管道均不存在，Docker Desktop/backend未发现，com.docker.service Stopped，18443/health连接失败。没有启动/修Docker或银行、改卷/日期；验收驱动未发BYOK或银行业务请求。已提示用户恢复原环境，无需再批准任务。后续账户目标/工件下载/历史刷新与网页重启/前后银行快照仍NOT_RUN；S5维持BLOCKED，正式28项及GO未提升。原失败报告未改写。

