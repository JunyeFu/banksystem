---
id: RF068-S5-REPAIR-EXECUTION-20261023
title: RF068-S5 成组修复实现与验收回执
document_type: reference
domain: architecture
status: draft
authority: evidence
version: 1.0
effective_date: 2026-10-23
owner: Codex
---

# RF068-S5 五组修复执行

执行依据：[已批准方案](S5-repair-plan-20261023.md)。源码基线main@552b3b8ac517bd5991bff446e72d9f4e87ea9543及保留的脏工作区；没有提交、推送、重建银行容器、修改银行数据或业务日期。状态只见backlog，顺序只见唯一实施顺序。

## 实现与复审

| 分组/问题 | 实际实现 | 反例与复审结论 |
| --- | --- | --- |
| RP01 / R01 | lifecycle提取inspectManagedOwnership，工作台仅调用一次完整doctor；本地健康10秒，启动30秒总界限不重置；owned但未健康显示NOT_READY；Worker原PID/15秒心跳仍核对 | 实际HTTP1800ms通过，短截止/拒绝连接/取消阻断；错PID/旧身份/过期Worker/迁移/SQLite/代码集错误不能READY |
| RP02 / R02/R07 | execute→生产readiness→doctor传递同一AbortSignal；模型90秒、本地请求10秒覆盖响应体；派发前再检查停止；具体依赖code保留到turn/UI | 等待中及serviceFor构造期间停止均dispatch=0、终态INTERRUPTED；401等具体原因保留；响应体悬挂可被截止/停止中断 |
| R03已排除项 | 保留RF067原状态转换保护 | 停止后不派发反例继续通过，不记作已发生的执行缺陷 |
| RP03 / R05 | WorkbenchRepository增加可信本机验收使用的executionSnapshot，同一只读事务按namespace+Journey读取全部run/task、attempt_count、run.claim及turn绑定；runtime inspect消费 | 201条背景运行后新增目标run仍被检测；无关Journey新增不干扰；跨namespace拒绝。未增HTTP/MCP工具、迁移或Quality写接口 |
| RP03 / R08 | S5专用断言读取经原CLI验证且逐字节复核的DOM/NETWORK/LEDGER，以同一个可见tr的完整textHash绑定遮罩账号/类型/余额/CNY/正常状态；核列表路径、标题、GET200及无业务API写请求 | 登录即结束、缺/不可见行、空/错余额、错币种、缺状态、错账户/run、缺网络/业务POST、篡改工件均失败。页面就绪结论来自完整账户行及页面/网络事实，未假称直接读取data-page-state。原Worker哈希DOM足够，未改采集协议 |
| RP04 / R04 | CLI正常及非零退出均解析严格事件，原requireCliSuccess接收真实退出码；保留安全stage/exitCode/错误 | 真实子进程退出0/4/5、坏JSON、无终态及错误终态通过；不自行计算证据通过结论 |
| RP04 / R06 | inspect不受start专用活PID保护阻断；start保留活PID/任务/备份门 | live+unhealthy时inspect返回只读回执，start仍拒绝；测试不产生文件或停止进程 |
| RP04 / R09 | 既有v4 manifest纳入三个S5入口、新专用断言及原遗漏的product-doctor.mjs | 文件覆盖与逐文件一字节漂移测试通过，验收入口改变使旧H失效；身份算法不变 |
| RP05 | 统一回归、浏览器复验和源码另轮反例复审后才冻结；LIVE脚本补业务事实、精确重启计数、历史切换、真实reload、当前模型手动选择/连接检查及阶段失败回执 | 源码/隔离门通过；冻结/启动与真实只读结论在下方运行回执追加，不能由本行推定完成 |

关键路径：产品`scripts/i10-agent-lifecycle.cjs`、`agent-cli/src/{product-doctor,workbench-application,workbench-production,workbench-http}.mjs`、`harness/src/workbench-repository.ts`；根`scripts/test/rf068-workbench-{live,assertions,acceptance.test}.mjs`、`scripts/test/rf068-workbench-runtime.test.cjs`、`scripts/demo/rf068-workbench-runtime.cjs`、`scripts/test/verify-agent-workbench.ps1`。前端仅改`src/agent/api.ts`及测试。

复审当轮发现并修正错误码放宽过度：原安全测试用PRIVATE_TOKEN_VALUE证明未知错误不得透传。最终限定AGENT/MODEL/HARNESS/MCP/WORKER/BROWSER/BANK既有错误族，HTTP与前端都有反例，未忽略失败或修改原安全断言。所有复审由同一执行者另轮完成，未冒充第二人复核或委派Agent。

## 实际验证

| 范围 | 最终结果 | 证据层级 |
| --- | --- | --- |
| verify-agent-workbench.ps1 -Scope Contract | 19/19＋9/9专项，生成OpenAPI检查通过 | CONTRACT / isolated regression |
| 同入口-Scope Integration | 39/39＋1/1本机runtime检查；tsc/元数据生成检查通过 | 真实隔离MCP/临时SQLite/DPAPI；模型/执行替身仅在测试进程 |
| 前端lint/test/build/build:agent | lint、类型、生成API、双构建通过；unit44/44 | STATIC / UNIT / BUILD |
| CLI release-lifecycle/headless-cli/journey-author-validate/journey-execute/journey-evidence-verify | 75/75，约66.82秒，含完整v4逐文件一字节漂移 | CLI regression，非BYOK |
| Browser/All | 5/5：Foundation2、History1、Conversation1、Models1 | ISOLATED_BROWSER |
| RF066/RF067/RF068治理及docs | 三批治理PASS；docs metadata755/links250（新增本文件前） | LOCAL_EVIDENCE |

Browser插件未提供，使用仓库既有Playwright；未安装依赖。实图/JSON位于：

`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s5-repair-20261023/browser/`

子目录foundation/history/conversation/models；页面身份、非空、无框架覆盖、控制台、交互通过。1440×1000模型配置和390×844中断态已实际查看，布局/换行/滚动正常，合成身份和模型仅为隔离证据。Agent JS654.33kB/gzip211.83kB，保留既有>500kB提示，不记为性能验收。

## 现场与运行门

收口前实际inspect：旧Harness/MCP/Worker PID均不存在；tasks/runs/action_plans/i8_candidate_build_jobs/workbench_turns及ACTIVE schedules全部0，迁移44/44，mutationPerformed=false。Docker Linux引擎仍不可连接，原银行环境未被本轮启停。该inspect计算的身份仅作当时观察，不冒充最终冻结。

### 冻结与托管启动实际回执

- 全部产品源码/构建修改完成后，使用原runtime入口冻结并启动，最终H=`0d9a22b1d5c40a61cf414e094c34d75303709ee080bdca8845d4f1b8e54ba196`。所有后续修改仅为证据/控制文档与仓外审查脚本，不改冻结源码。
- 启动回执：产品根`.data/rf068-s5/b0143bc6-3a1f-4768-9722-59100450361f`；原库一致性备份`.data/sqlite/offline-backups/rf068-s5-1ebd86e9-83c3-4d1b-b27b-f4a36bcc7b29.sqlite`，完整性ok，SHA256=`fe1801289ab2b48e4c0268253f77980ce74fafd932d2803a6f8fdf57af4d037d`。没有恢复或覆盖原库。
- Harness PID53836、MCP74088、Worker73944均owned/current/healthy；Agent web PID44124经原agent-workbench.ps1启动，status=RUNNING，`/agent/`静态页HTTP200。没有把静态200记为产品READY。已更新本项目18788/18789/18790的全局端口登记。
- 启动后inspect：H与冻结一致，迁移44/44，六种活跃聚合计数仍全部0。没有新增迁移、银行客户、账户、凭据登记、Journey或Run。

### RP05真实验收的当前停止门与根因

已执行环境预检，当前结论为`BLOCKED_BEFORE_LIVE`，不是银行目标已失败或通过：

1. Docker当前desktop-linux及default两个管道均不存在；Docker Desktop/com.docker.backend进程未发现，com.docker.service为Stopped。
2. 实际GET `http://127.0.0.1:18443/health`连接失败。即使Agent三组件健康，银行服务也不具备实机条件。
3. 因明确前置条件未满足，本轮验收驱动未发真实模型或银行业务请求，仅做健康GET。原银行容器和数据不动，没有启动/修复Docker、重建/重置、删卷或改业务日期。已向用户提示启动其原环境；这不是再次索要任务批准。
4. 后续完整账户目标、证据下载、实机历史/刷新/网页重启与银行前后快照均NOT_RUN。本轮不能将S5标DONE，也不能声称真实BYOK/正式28项/GO通过。

恢复入口：银行原环境恢复后先只读核对健康与H未漂移，运行`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1 -Scope LiveReadOnly`。沿用已有S5新身份及只读授权，从本任务起点执行；首次确定性LIVE失败立即停止并写当次报告和根因，不自动修复后悄悄续跑。原失败报告f5671eef-9955-4dd0-a855-4e0d9ac17239保持不变。

### 补充业务断言契合检查

冻结后在仓外执行`account-render-contract.mjs`：用真实AccountList组件和原Worker captureDomEvidence函数，在合成数据/隔离Chromium中验证完整行摘要与S5断言契合，最终PASSED（ISOLATED_RENDERER_CONTRACT）。初次夹具的Windows ESM路径、ESM/CJS QueryClient上下文及HTML字符集问题已在仓外脚本修正，产品代码未改。SSR的useLayoutEffect提示仅针对该未水合静态夹具，不作产品浏览器无警告声明。该检查不提升为银行LIVE，原5项Agent浏览器检查仍是正式隔离页面证据。

最终回读仍为同一H，三组件healthy、网页RUNNING、任务/调度0。控制状态：RF066-S2源码门DONE，RF067只读补充通过，RF068-S5仍BLOCKED；RP05实机部分未完成。最终RF066/RF067/RF068治理PASS，docs为PASS（metadata756、links256、order_files767）。

## 2026-10-24 — 恢复环境后的首次 LIVE 与根因记录

用户恢复Docker后沿用既有授权，未更改源码或重新冻结。原15个容器运行，带健康检查的银行关键服务全部healthy，Gateway健康GET返回200。Harness53836/MCP74088/Worker73944为owned/current/healthy，Agent web44124运行；H仍为`0d9a22b1d5c40a61cf414e094c34d75303709ee080bdca8845d4f1b8e54ba196`，迁移44/44、初始活跃聚合全部0。

实际运行既定LiveReadOnly入口，报告位于`agent/runs/rf068-s5/778e3726-d0ec-4a9e-945d-4ae653b30327/report.json`。北京时间2026-10-24 00:19:04至00:19:45（报告使用UTC）。AUTHORITY、BROWSER_BOOTSTRAP、READ_ONLY_BANK_BASELINE、CREDENTIAL_REFERENCE、MISSING_INPUT通过；在BYOK_READ_ONLY_EXECUTION阶段首次确定性失败，顶层`JOURNEY_EXECUTION_FAILED`，后续验收STOPPED。浏览器console errors/warnings均0，结束H与开始一致。

### 已确认的失败链与证据

- turn=`ec699efd-d4f0-4c60-bfdf-99f4c6d3332c`，Journey=`journey_9b61a109-e1dc-4216-a1c5-44918e701baf`；真实Controller模型为deepseek-v4-flash。工具事件证实已完成目标准备、创作提交和candidate_compile调用。
- 对该Journey的Harness只读回读：stage=FAILED_ACTIONABLE、status=FAILED、error.category=AUTHORING、error.errorCode=`I10_MIDSCENE_TARGET_NOT_FOUND`。buildJob=`buildjob_e069c58e-1230-480d-9f4f-554236bcafc6`，status=FAILED、attempt_count=1。失败发生在候选创作浏览器，正式Run/Task尚未产生；精确executionSnapshot的runs为空。
- 该job专属脱敏诊断文件位于产品根`.data/evidence/i10/midscene-diagnostics/buildjob_e069c58e-1230-480d-9f4f-554236bcafc6.json`。动作1 goto完成于`/portal/login`；动作2 `act_02_969d21f7ffb0ef7526ba`定位DYNAMIC_002（统一身份认证入口）失败。视觉配置为mimo-v2.5/xiaomi-mimo；三次均TARGET_LOCATION、同一错误指纹，未记录可用位置。尚未执行SSO点击、凭据填写或银行业务提交。
- 根因层一（已证实）：Worker的observeTargetWithMidscene调用aiLocate未取得目标位置，classifyMidsceneError映射为上述错误。验收自己的真实Keycloak登录及账户基线已通过，不能将此归为银行不可用或凭据失效。现有诊断只保留错误指纹；receivedModelContent=false只检查异常对象rawResponse/response字段，不能证明模型未响应。页面观察时序、提示与视觉响应究竟哪项导致定位失败，现有证据不足，须继续定点诊断，不能冒称已确定模型能力或页面缺陷。
- 根因层二（源码证实）：MCP journey_get使用compactJourneyForFlowise投影，未传递Harness的error对象；production-service.mjs的waitForJourneyStage读取current.error.errorCode为空，因而返回通用JOURNEY_EXECUTION_FAILED。当前UI未能显示真正的定位失败原因。
- 附带已观测行为：Worker内部既有定位循环执行了3次，而验收驱动在首次终态失败后停止、没有重跑。内部重试并非本轮增加；其行为与“首次确定性失败立即停止”的端到端要求有差距，修复时需对确定性目标定位失败停止重试，不能仅声称外层停止即完全满足。

### 最小修复方向与后续门

1. 在上述动作边界核对实际截图/SDK脱敏定位错误和页面就绪事实，先复现具体原因，再修对应观察或定位逻辑；不以增加重试、硬编码坐标或备用模型掩盖失败。
2. MCP投影保留白名单化的error.category/errorCode/recoverable；验证Harness→MCP→Controller→turn的同一具体失败码，避免错误摘要丢失。
3. 确定性定位失败首错即终止；加入该动作与错误传播的针对性回归。所有源码修复、构建及复审完成后生成新H，再从S5起点验收。不得续写本次失败报告为成功。

本轮按用户停止条件没有修改产品源码、自动修复或再次发起LIVE。仅Agent任务/凭据登记产生正常平台状态；银行基线读得2个账户，摘要`d89b83251469c1369d3918b7905557533a762c9a7d0355fc66cc60d9a2044303`，失败后银行快照NOT_RUN，不声称已完成前后守恒/不变性验收。后续账户证据、历史刷新/网页重启、模型配置与窄屏验收均NOT_RUN。结束回读确认原银行容器仍运行、三个托管组件healthy、全部活跃聚合0。银行服务、卷、业务日期未修改；S5保持BLOCKED，当前阻塞已从环境前置条件变为候选创作定位失败及具体错误丢失。

### 2026-10-24 定点复查：确认上游模型拒绝，修正初步归因

本节替代上节关于视觉定位底层原因尚未确定的初步判断。只读解析本次三份SDK报告的错误字段，并用当前Worker分类函数在内存中回放同一异常；没有模型新请求、浏览器重跑或产品源码变更。

三份报告位于产品根`.data/midscene-runs/report/`：`playwright-2026-10-24_00-19-39-1e5090fc.html`、`playwright-2026-10-24_00-19-41-2c023591.html`、`playwright-2026-10-24_00-19-43-9395debb.html`。全部记录相同上游错误：`400 Unsupported model mimo-v2.5`，SDK每次均`0 retries (1/1 attempts)`。报告内的受限可交互控件摘要包含`button:统一身份认证登录`，故这次并非目标按钮不存在的证据。

确认的因果链为：视觉端点拒绝所请求模型 → SDK包装为failed to locate element → Worker误分类TARGET_NOT_FOUND并重复3次 → Harness保存误分类码 → MCP丢弃error对象 → Controller只报JOURNEY_EXECUTION_FAILED。

| 层 | 已确认根因 | 最小修正方向 |
| --- | --- | --- |
| 视觉配置/服务 | 本次端点不接受mimo-v2.5，HTTP400；Controller的deepseek-v4-flash可用并不证明视觉模型可用 | 核对该端点/账号实际允许的视觉模型标识或服务路由，再明确修正模型绑定；不能只改提示或盲换模型。本轮未查询供应商模型目录，尚不能断定是模型下线、别名错误、权限还是网关路由问题 |
| SDK与Worker分类 | SDK1.10.5的ai-model/inspect.js将AI接口错误转为errors数组；service/index.js再加failed to locate element前缀。Worker classifyMidsceneError按前缀分类，未提取内层400/模型拒绝 | 优先识别结构化/嵌套的模型接口失败，保留安全状态码及明确原因；离线回放三份实际错误均复现误分类 |
| 停止语义 | SDK自身重试0，但Worker外层无条件执行3次定位尝试 | 对模型不支持等确定性配置错误首错停止，不进入定位重试 |
| 准备就绪 | product-doctor仅探测HENGZHUN控制模型；Worker检查只核代码集，没有视觉模型请求能力检查 | 在执行所需视觉能力的准备门验证实际视觉绑定；验证必须覆盖对应请求能力，不能仅凭容器健康或模型名称配置存在宣称READY |
| 错误传播 | MCP compactJourneyForFlowise未保留error，导致production-service取不到errorCode | 保留脱敏类型化原因，验证接口→MCP→Controller→UI一致显示；不传原始响应或密钥 |

安全配置比对确认当前VISION模型为mimo-v2.5，视觉与Controller端点不同，未配置独立MIDSCENE端点覆盖。Worker源码在创建SDK前将VISION配置映射到MIDSCENE及OPENAI变量。本次仅输出配置存在性及摘要，没有读取到上下文或打印密钥/端点正文。上述证据不支持“把Controller误当视觉模型”这一猜测，也不足以确定供应商端拒绝模型的管理侧原因。

修复优先级调整：先解决视觉端点与模型绑定的可用性，同时修正分类、首错停止和MCP错误投影，再回归、构建、冻结新H。无需先改银行登录页、选择器或扩大页面重构。正式LIVE仍停止，银行和Agent服务保持原状。

## 2026-10-24 — 视觉模型拒绝专项修复执行

用户明确授权完成模型核实、源码修复、回归复审、最后冻结与S5只读重验；细化V1–V4已回填S5任务包，Worker/CLI归RF066、MCP归RF067，保持原实施顺序。本轮没有提交、推送或操作银行容器、卷、数据、业务日期。

### 配置核实与选择

- 对原视觉端点`api.xiaomimimo.com/v1/models`使用既有凭据只读查询：HTTP200、7个模型，不含`mimo-v2.5`，包含`mimo-v2.6-flash/pro/pro-ultraspeed`及4个语音型号。未保存或输出密钥。
- 依据[小米官方Flash说明](https://mimo.mi.com/models/en-US/mimo-v2.6-flash)及[官方图像协议](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/multimodal-understanding/image-understanding)，明确选择同端点的`mimo-v2.6-flash`，family保持xiaomi-mimo，Controller保持deepseek-v4-flash。没有运行时备选或失败切换。
- 配置来源核对：旧视觉名称来自机器继承环境，产品runtime.env原无VISION模型项。原文件已留存于产品根`.data/rf068-s5/vision-binding-1a18e742-4917-49bb-9c69-f0acbfdafc92.env.before`；本地增加`VISION_MODEL_NAME=mimo-v2.6-flash`。loader仅为项目视觉名称/族提供明确本地覆盖，其余HENGZHUN优先级保持；机器全局环境、密钥及端点未修改。
- 直接合成图片调用HTTP200，但首次严格RED字符串判定为false，该结果不被记作视觉语义通过。随后用真实Midscene SDK、与Worker同配置/缩图/坐标映射的合成红色READY按钮完成DOM命中校验，返回I10_VISION_READY。生产doctor的独立Node20子进程入口也实际返回READY；这些是配置/SDK合成能力检查，尚非银行LIVE。

### 实现及复审

| 改动 | 实际行为与验证 |
| --- | --- |
| worker/src/i10-vision-readiness.cjs | 与Worker共用configureVisionModel；真实Chromium+Midscene仅观察本地合成图，定位后用DOM核验命中；不访问银行，不输出凭据/端点/原始响应，不生成SDK报告污染机器JSON回执 |
| Worker分类 | 优先识别结构化或SDK嵌套的HTTP/模型拒绝，保留I10_MIDSCENE_MODEL_UNSUPPORTED、HTTP状态码及安全类别；区分wrapped timeout、解析失败、实际目标缺失。模型响应正文不透传 |
| Worker首错停止 | 最大视觉尝试为1，并删除外层重试/等待/再次提示循环；实际异常和坐标/语义不匹配立即终止。既有只读/凭据/Playwright核验边界保留 |
| doctor | Controller模型通过后，真实Node20隔离子进程探测实际视觉绑定；视觉失败即NOT_READY，继续支持截止与用户取消。测试进程可注入探测函数，生产默认始终真实SDK |
| MCP与UI | Journey投影仅保留errorCode/category/recoverable；真实MCP传输证明具体原因保留。Controller继续消费现有errorCode，turn/HTTP/前端接受I10_VISION及I10_MIDSCENE安全族，PRIVATE_TOKEN_VALUE等未知族仍隐藏 |
| 身份与代码集 | 视觉名称、族及端点摘要纳入现有modelConfigIdentity；新Worker文件纳入代码集及v4源码清单。模型变动改变身份；未另建旁路身份算法 |

另轮复审并修正：旧源码正则测试随配置提取改为实际配置行为断言；新Worker清单须按路径排序，已修正后完整重跑身份测试；治理最多同时打开2模块，本轮RF066仅打开CLI/Worker，已关闭的Controller源码未改。实际SDK隔离400反例收到一次请求，验证安全失败JSON和首错停止。复审由同一执行者另轮完成，没有冒称第二人审查。

### 最终通过检查

| 范围 | 结果 |
| --- | --- |
| Contract | 19/19＋11/11，生成OpenAPI检查通过 |
| Integration | 41/41＋runtime1/1，实际MCP错误投影/临时SQLite/生产Controller合同通过 |
| Worker专项 | midscene-diagnostics＋generic-worker-routing共59/59；含真实SDK/Chromium对隔离400端点仅1请求 |
| CLI专项 | release-lifecycle、headless-cli、journey-author-validate、journey-execute、journey-evidence-verify共76/76，约50.16秒，包含逐文件一字节漂移和候选失败不提交run |
| 模型绑定专项 | model-binding与headless-cli共35/35（与上行有重叠，不相加） |
| 前端 | lint、45/45 unit、Quality/Agent双构建通过；保留既有构建体积提示，不作为性能验收 |
| Browser/All | 5/5，隔离Foundation/History/Conversation/Models，实际生产HTTP/MCP与临时状态，非银行LIVE |
| RF066/067/068治理及docs | 全部PASS；验证结构不等同运行通过 |

### 冻结/启动阻塞：尚未进入新身份 LIVE

源码收口后inspect计算候选H=`618b078b7b3ca43f0d3ae4b7c658faa95c94d4c9e0ab1b1bf1b8f20ec193c129`。本轮观察旧Harness53836/MCP74088/Worker73944均已不存在，runtime=NOT_RUNNING，迁移44/44，六种活跃聚合0。原银行15个容器仍运行、关键健康检查healthy；其他项目容器未操作。不能把此前旧PID健康状态沿用为今日实况。

随后调用原入口进行银行健康回读、网页状态和`rf068-workbench-runtime.cjs start <候选H>`，工具自动审批在执行前拒绝整个命令，返回`Rejected: blocked by policy`，未提供更细原因。本轮没有绕过工具拒绝，未执行该启动/授权绑定命令，也未重试另一种调用渠道。

因此候选H已计算、尚未完成运行冻结绑定，原runtime.env的LIVE授权仍为旧H；未产生新启动回执/SQLite启动备份，也未运行S5新身份LIVE。该停止是工具执行阻塞，不是新一轮确定性LIVE失败。S5仍BLOCKED；RF066源码门DONE、RF067源码补充通过。继续入口为允许执行原托管启动命令后，核对当前H、绑定/启动自有Agent与web，再从LiveReadOnly起点验收；保持首次确定性LIVE失败立即停止。原银行服务与数据保持不动。

### 2026-10-24 后续冻结与首次LIVE已执行

用户再次明确指令后，同一原托管入口启动成功，无工具规则/全局权限修改。H618b078b…93c129已冻结绑定，SQLite备份及自有服务启动完成。随后完整S5在第二个动作首次失败：视觉正确选择login-sso-submit，但Worker将“点击统一身份认证入口”整句与页面“统一身份认证登录”做字面包含匹配，误拒为I10_MIDSCENE_LOCATOR_MISMATCH。只定位一次，具体码正确传播，尚未产生正式Run；后续验收立即停止。原银行及Agent服务保持运行。报告ae132adb-4036-4130-9cd6-b263029bc797；完整证据、根因与下一修复方向见[新身份LIVE根因](S5-live-root-cause-20261024-02.md)。前述工具阻塞为历史状态，当前S5阻塞为新发现的语义误拒，不再是模型拒绝或启动策略。
