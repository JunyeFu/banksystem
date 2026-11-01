---
id: RF068-S5-REPAIR-20261023
title: RF068-S5 源码复审、反例与成组修复方案
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-23
owner: Codex
---

# RF068-S5：已证实问题与验收缺口成组闭合

## 结论与边界

S5尚未完成。前端、合同及隔离集成回归通过，但首次LIVE停在Controller派发之前；本轮新增9个独立反例中8个未满足预期、1个通过。不能将这些问题归结为“把1500ms调大”或“Docker未启动”。本文件给出一次成组修复、统一构建、最后冻结与复验的方案，不保证尚未执行的LIVE必然成功。

本轮完成源码审查、测试和方案落盘，**未实施产品源码修复、未冻结身份、未发真实BYOK或银行业务请求**。不因用户允许充分预算而扩展到无关重构。项目先后关系只见[唯一实施顺序](../../../../../agent/plans/active/v54-implementation-batches.md)，状态只见[backlog](../../../../../agent/backlog.yaml)；继续使用RF068-S5，后台修改回归RF066-S2职责，不另开路线图。RF067的停止状态机已验证有效，不为凑齐跨层修复改写它。

### 当前环境与历史证据分开

- 当前源码基线：`main@552b3b8ac517bd5991bff446e72d9f4e87ea9543`及保留的脏工作区。不得宽泛暂存或覆盖其他修改。
- 2026-10-22冻结身份：`5fc8fcd473092200529dc006f211a9e84d2ce2e526b06213ea6e6c4b8edadd95`；原LIVE报告`agent/runs/rf068-s5/f5671eef-9955-4dd0-a855-4e0d9ac17239/report.json`失败，code为`AGENT_MANAGED_RUNTIME_NOT_READY`，没有Journey/Run/Task。启动、备份、迁移及真实模型就绪探测曾完成，不能写成“未授权、模型调用0”。
- 2026-10-23本轮只读现场检查：Docker Desktop Linux引擎管道不存在，18788/18789/18790无监听。昨日“15容器与托管服务仍运行”是历史事实，不代表今日。没有证据说明是谁或何时停止；本轮没有执行停止、重置、删卷、改日期或Docker AI操作。
- 当日非LIVE测试使用临时SQLite、隔离进程与测试替身，退出只清理测试自己创建的资源；不接管原服务。环境未就绪不阻止源码修复，但阻止原机LIVE验收。

## S5完整要求映射

| 原小任务 | 已有证据 | 当前缺口及对应修复 |
| --- | --- | --- |
| UI-A01 托管入口 | 昨日原库备份、43→44迁移及所属进程启动回执 | 健康与存活混用、inspect提前抛错；RP01、RP04 |
| UI-A02 对话与持久化 | 真实缺输入与失败turn；隔离历史、对话、模型及停止反例通过 | 真实账户目标未完成；重启计数谓词不可靠；RP02、RP03、RP05 |
| UI-A03 反例复审 | 本轮9个新增反例、既有CLI49项；已排除停止后仍派发的猜测 | 8个失败反例须转成各所属模块的正式回归；RP01–RP04 |
| UI-A04 桌面/移动端 | 当日5项隔离浏览器检查及截图；已查看390×844失败态，无横向溢出 | LIVE成功结果、证据、历史切换及模型交互尚未贯通；RP05 |
| UI-A05 分级证据 | 合同/隔离门与原失败LIVE分别保存 | 源码门通过不能代替真实验收；最终一次冻结后从S5起点复跑 |

## 已确认的问题与反例

编号对应本轮审计测试名，不是新的全局批次或状态记录。

| 编号/性质 | 实际代码与根因 | 实测与影响 | 处置 |
| --- | --- | --- | --- |
| R01 / 运行阻断、诊断错误 | `scripts/i10-agent-lifecycle.cjs`的`httpOk`默认1500ms访问完整`/health`，`managedStatus`把owned但健康失败也标NOT_RUNNING；workbench随后又完整doctor一次 | 原现场正常200曾耗时2269ms；本轮本地HTTP服务器1800ms返回200，被实际函数判false。深检有成本，但剩余延迟尚未全归因 | RP01拆清进程归属和产品就绪，单次深检及有界等待，不能只调大超时 |
| R02 / 原因丢失 | `workbench-production.mjs`折叠托管组件错误；`workbench-application.mjs:99–100`只保留AGENT_前缀的readiness code | 输入`MODEL_HTTP_401`实际持久化成`AGENT_DEPENDENCY_NOT_READY`，dispatch=0。现有turn failureCode允许通用安全码 | RP02保留安全原因与组件，不将服务端正文/密钥透传 |
| R03 / 已排除 | RF067 Repository拒绝STOP_REQUESTED继续转RUNNING | 停止发生在readiness等待时，dispatch=0、终态INTERRUPTED；反例通过 | 保留此不变量，不宣称停止后仍执行；与R07区别对待 |
| R04 / 验收驱动缺陷 | `rf068-workbench-live.mjs:53–57`先await execFile，非零退出在解析JSONL之前抛错；正常分支却固定向requireCliSuccess传code=0 | 合成CLI退出5并输出`I10_EVIDENCE_HASH_MISMATCH`，驱动只收到数字5，最终可变成通用验收失败 | RP04保留真实exitCode和已定义终态错误，禁止吞失败变成功 |
| R05 / 不重放证明不成立 | LIVE驱动172–185行比较Quality runs列表length；`quality-read-model.ts`查询最多200条 | 实际SQL在201→202条时两个列表均200，现有谓词漏掉新增run。不是证明现在已重复执行 | RP03改为本次Journey/turn的权威执行引用集合，不改变Quality显示上限 |
| R06 / 诊断入口缺陷 | `rf068-workbench-runtime.cjs`的未健康活PID保护位于inspect/start分支之前 | inspect在owned但未健康场景直接抛`RF068_LIVE_MANAGED_PROCESS_REQUIRES_REVIEW`，无法输出组件状态 | RP04把启动变更保护仅用于start；inspect始终只读解释现场 |
| R07 / 停止无法中断等待 | execute持有AbortController，却调用`readiness(config)`不传signal；生产readiness也未向doctor传signal | 实际app测试显示readiness未收到signal。停止状态机虽挡住执行，请求仍可能悬挂，STOP_REQUESTED不能及时收敛 | RP02传播同一signal到网络读取，取消与超时区分，不增重试 |
| R08 / S5业务验收缺口 | 驱动仅消费通用`rf057/agent-assertions.mjs::assertAgentEvidence`，该函数核身份/终态/工件种类与摘要，不负责账户页面事实 | 满足通用合同但不含账户页、余额、币种、状态的对象仍通过通用断言。驱动自己的前后账户快照不证明Agent完成了目标 | RP03增加S5账户目标专用断言；不把它误报为通用验证器漏洞或真实伪造事件 |
| R09 / 身份覆盖缺口 | `agent-cli/release-identity-v4-manifest.json`未列本次3个入口；freeze.json另记摘要，但LIVE未消费该文件核对脚本 | 当前身份files集合确实缺`verify-agent-workbench.ps1`、`rf068-workbench-live.mjs`、`rf068-workbench-runtime.cjs` | RP04纳入现有productAcceptance组，修改任一入口都使旧身份失效；不造第二套身份算法 |

代码相对路径中`agent-cli/`、`harness/`和上述`i10-agent-lifecycle.cjs`均位于`platform/hengzhun-regression-system/`下。行号仅作本轮定位，实施以函数名与当前源码为准。

### 不升级为已确认缺陷的事项

- 未确认SQLite损坏、PID被抢、模型生成失败或银行业务错误。原Harness quick_check约364–381ms、Worker代码集约18–36ms，不能解释完整2269ms延迟；执行时记录实际单阶段耗时再判断。
- 既有转账/停止/结果未知语义不因本轮检查而重写。R03说明现有状态机有实际保护作用。
- 模型菜单和配置在隔离环境已覆盖，但LIVE脚本目前只打开页面，尚不足以称“真实模型选择/连接检查验收完成”。这是覆盖缺口，不是模型配置功能已被证明损坏。
- 654.29kB主JS的既有构建提示保留；没有本轮性能失败证据，不为清提示拆分整个前端。

## 五组修复任务（在现有S5内部执行）

所有组完成源码与隔离回归后才进入最后一组的冻结/LIVE，不每修一处就发真实模型重跑。组内步骤是本项操作细化；项目顺序仍以唯一实施顺序为准。

### S5-RP01：消除重复健康门，保留真实就绪检查

**目标/归属：** RF066-S2的托管生命周期与生产接线修复；不默认修改Harness健康合同或新增健康服务。

**精确路径：** `platform/hengzhun-regression-system/scripts/i10-agent-lifecycle.cjs`；`agent-cli/src/workbench-production.mjs`、`agent-cli/src/product-doctor.mjs`、`agent-cli/test/release-lifecycle.test.mjs`及现有doctor/生产接线测试。后四类路径均相对产品根。生命周期脚本当前不在RF066允许路径，实施前在RF066 batch/slice/task/backlog中补这一精确文件，不扩大到scripts全目录；仍不跨银行模块。

1. 提取生命周期中已有“托管记录→当前身份→PID/可执行文件/entrypoint归属”的检查作为明确的ownership observation，由status/start和workbench复用；观察返回进程事实，不伪装成HEALTHY，也不注入恒true的health替身到生产路径。
2. workbench先核身份授权/进程归属，再调用**一次**`probeProductReadiness`；保留Worker心跳状态、PID与新鲜度检查，并保留doctor现有模型、迁移、SQLite、Worker代码集、浏览器和银行检查。省掉的是重复Harness深检，不是任一真实门。
3. 生命周期状态必须区分“进程不存在/不归属”和“存在但未就绪/检查超时”。对外既有healthy布尔含义保持；需要新增状态值时同步实际消费者与合同测试，不能仅改返回字符串。慢健康响应不再被描述成进程已停止。
4. 对既有本地健康请求设置单次10秒上限（覆盖已观测2.269秒响应和SQLite既有5秒busy等待），可被外层signal提前中止；启动仍受现有30秒总等待约束，不在每次poll重置总上限。这个边界是明确失败截止，不是重试。workbench模型探测沿用Controller既有90秒模型预算；本地检查使用上述10秒单次预算，整次readiness另受调用方剩余期限约束。
5. 不把所有HTTP200等同完整就绪；原完整`/health`的迁移/quick_check/Worker代码集结果仍被验证。暂不新增缓存、后台健康采样或lightweight endpoint。

**验证/完成门：** 1800ms健康200通过；拒绝连接、非200、无响应截止、迁移未齐、quick_check失败、旧Worker代码集/过期心跳、错PID/旧身份均明确阻断。断言一次workbench readiness只发一次Harness深检，owned不等于READY。保留原CLI49项。若实现确需改变Harness合同，先补RF067任务再做，不能从S5越权改后端。

### S5-RP02：可取消的就绪检查与可定位失败

**目标/归属：** RF066-S2；只修已发生的错误信息丢失与已复现的signal断链。

**精确路径：** 产品`agent-cli/src/workbench-application.mjs`、`workbench-production.mjs`、`product-doctor.mjs`及对应现有测试；必要的前端安全错误码显示在`apps/quality-case-portal/src/agent/api.ts`和已有错误文案模块内归RF068。

1. `execute`调用`readiness({...config, signal: control.signal})`；生产readiness、doctor的model/Harness/MCP/bank请求与响应读取消费同一取消信号。派发前显式检查signal并保留Repository版本/状态转换约束。
2. 停止期间取消请求应及时结束等待，且不再进入下一检查或Controller；已交给Worker的未知结果继续INTERRUPTED/人工介入，不把AbortError表述为银行回滚。bootstrap/显式检查连接没有turn，也必须使用有界请求，避免页面永久等待。
3. 保留doctor已定义的安全code，例如`MODEL_HTTP_401`、`HARNESS_STATE_INVALID`、`WORKER_NOT_READY`；托管归属/心跳错误保留具体组件。现有failureCode/blockingReasons能表达时复用，暂不增DTO。仅允许规范化错误码和固定组件名，不存供应商错误正文、Authorization、URL凭据或栈。
4. 区分用户停止、明确依赖失败与等待截止；不能因宽泛catch全部改成依赖不可用，也不能让取消导致第二次FAILED覆盖INTERRUPTED。前端problem code处理与turn failureCode采用一致安全语法/已定义映射，不只认AGENT_。

**验证/完成门：** R02、R07转绿，R03继续通过；在readiness开始前/等待中/完成到派发交界停止，Controller调用均为0；401、Harness失败和Worker旧代码的具体原因到达turn与UI；无秘密输出。原Conversation、Models及并发/丢响应测试继续通过。

### S5-RP03：证明Agent完成只读目标，精确证明重启不重放

**目标/归属：** RF068验收驱动，不让测试自己的浏览器替Agent完成业务证明。

**精确路径：** `scripts/test/rf068-workbench-live.mjs`、拟新增的`scripts/test/rf068-workbench-assertions.mjs`及`scripts/test/rf068-workbench-acceptance.test.mjs`；现有通用`rf057/agent-assertions.mjs`保持通用职责。优先消费现有Harness/MCP证据读取；确需新查询才归RF067 Repository/MCP只读合同，不增加Quality写接口。

1. 通用证据验证成功后，读取同一Journey/Run的**实际已校验工件内容**，核对Agent到达账户查询页、页面READY、目标合成账户标识、余额、CNY及状态；对应网络只读响应与页面事实一致。不能只检查5种工件名称、JSON自称PASSED或报告中写出的业务字段。
2. 固定本次目标是登录后只读查询账户。登录鉴权POST不是资金操作；验证不能把所有POST都当业务写。Worker实际动作/网络不得包含转账提交或其他业务写路径，前后银行快照仍作为独立资金不变检查。不得将驱动自己的账户快照充当Agent DOM证据。
3. 增加登录即结束、空余额、错币种、缺状态、错账户、错Journey/Run或篡改摘要的反例；缺业务证据明确失败，不由人工编辑报告补齐。现有工件若缺必要语义，先确认真实工件结构，再在既有采集点做最小补齐，按Worker所属控制范围登记，不引入第二个验证器或运行时mock。
4. 重启前后比较该Journey关联的完整run/task引用集合及执行领取次数，并比对原turn、checkpoint和模型绑定；使用现有认证账本查询/完整分页，不用Quality最多200条的展示列表长度。浏览器POST计数保留作补充证据，不承担后台不重放证明。
5. 若现有API仅给最后一次run，优先在可信本地验收辅助中调用Harness现有Repository的只读查询；不能直接新建跨表写入Repository。新只读投影确有必要才归RF067补合同。控制查询按namespace+Journey收敛，输出只含ID/计数，不导出原库。

**验证/完成门：** R05、R08转绿；数据库已有201条时再新增本次Journey run仍能检测失败；不相关Journey活动不误判本任务重放；所有业务反例失败、真实完整只读目标成功。Quality既有200条上限不修改。所有新驱动辅助文件纳入RP04身份清单。

### S5-RP04：修复驱动、检查入口与身份绑定

**目标/归属：** RF068的验收/托管脚本；身份清单归RF066既有agent-cli范围。

**精确路径：** `scripts/test/verify-agent-workbench.ps1`、`scripts/test/rf068-workbench-live.mjs`、`scripts/demo/rf068-workbench-runtime.cjs`、产品`agent-cli/release-identity-v4-manifest.json`与`agent-cli/test/release-lifecycle.test.mjs`；RP03共用的`scripts/test/rf068-workbench-acceptance.test.mjs`、拟新增的`scripts/test/rf068-workbench-runtime.test.cjs`及本批控制文件。

1. CLI包装器在正常及非零退出两条路径都解析受限JSONL终态；把真实exitCode交给`requireCliSuccess`。进程未启动、超时、无合法终态分别明确失败，保留安全stage/code/exitCode，不能忽略exit5或把无终态当成功。测试覆盖退出0/4/5、坏JSONL及无输出。
2. LIVE的api/CLI等待绑定当前步骤剩余期限；`readTurn`的15分钟总期限必须约束其内部悬挂fetch，不能只在两次fetch之间看时钟。失败报告即时落已完成步骤及耗时、首次失败stage、安全code/断言标签与exitCode，保留已得到的turn/Journey引用，不输出原响应/密钥。不为失败补跑后续业务；无after快照就明确NOT_RUN。
3. runtime inspect即使服务不健康也输出归属、组件状态、迁移及聚合活跃计数，`mutationPerformed=false`；启动专用保护移到start分支。start仍禁止抢端口、终止未知PID及有活跃任务时迁移。旧身份但仍存活的自有Agent组合需要现有受控停止/重载流程：先无活跃任务及备份，再只切换这些Agent进程；不能通过绕过guard自动覆盖登记，也不触碰银行容器。
4. 将3个已存在入口及RP03实际新增辅助文件列入现有`repositoryGroups.productAcceptance`。保留freeze.json作操作回执，但唯一源身份仍由现有v4算法生成；不依赖一份未被消费者读取的旁路摘要证明冻结。
5. 加入逐文件一字节变化使身份改变的测试；LIVE开始与结束均核H一致。统一字段：`turn.status=COMPLETED`、`turn.result.kind=TEST`、`turn.result.verdict=PASSED`；证据另为`proof.verdict=VERIFIED`、`runStatus=PASSED`、`taskStatus=SUCCEEDED`。不能混用PASSED和VERIFIED。

**验证/完成门：** R04、R06、R09转绿；不健康inspect仍只读有结果、start仍拒绝未知进程；失败不会输出成功报告；任何实际验收入口漂移都会使旧H失效。控制文件的历史失败保持原样。

### S5-RP05：统一回归、复审、一次冻结与真实验收

**目标/归属：** 返回原RF068-S5 UI-A01–A05，不扩大为正式28项或整体发布。

1. 将本轮红测试移入所属正式测试套件，改成通过真实公开入口验证，不长期依赖审计脚本的AST提取/VM注入。先复验上述8个问题与R03保护，再跑Contract、Integration、CLI49项、前端lint/typecheck/unit、Quality和Agent双构建、生成客户端、Browser/All、RF066/067/068治理与docs。另轮从反例核对diff，由同一执行者独立轮次复审，不冒充第二人或自动委派。
2. 所有影响身份的代码/合同/构建/清单修改收口之后生成新H。沿用用户已授权的“S5新身份冻结、托管启动及真实BYOK只读验收”范围，实际绑定并留回执，不重复逐包审批；不沿用旧失败身份的通过证据。若需银行重置、业务日期改变或新模型范围，另行确认，不能由本授权推导。
3. 先验证Docker和原银行服务实际就绪。保持现有运行服务；不自动修Docker、删临时端点、重建银行镜像或重置卷。按原托管入口检查自有PID/端口与活跃任务，必要迁移前备份。原服务本就未运行时如实记录，不能把“保持运行”写成已完成。
4. 一次完整LIVE从头执行：浏览器新会话→缺输入→补明确只读目标→唯一BYOK真实Controller/Worker→账户业务断言→完整证据核验及Quality一致→切换旧失败/已完成历史→真实页面reload→只重启Agent web→原任务回读不重放→银行前后快照。默认和选择仅使用已授权模型profile；显式选择当前模型并执行一次连接检查，核对下一任务绑定与旧任务不变，不为了演示另配未授权端点或暴露密钥。
5. 留1440×1000与390×844的主屏/菜单/配置/缺输入/运行/结果/证据截图，对照已确认Figma的字体、几何、颜色、图标、布局及键盘/滚动/侧栏。失败视图复用隔离反例，不制造真实业务失败。首次非预期确定性失败立即停后续验收，仅保留安全清理与服务；修源码后新H从起点重跑，不续填旧报告为成功。

**完成门：** 原S5机器谓词全部满足，8项新缺陷/覆盖缺口逐项有修后证据，R03不变量仍成立，失败原因能定位，历史读回/停止无新派发，真实只读目标由Agent自身证据证明。此时才在backlog将S5标DONE；正式28项、远端CI、镜像安全/许可与整体GO仍独立判断。

## 本轮测试实绩与复现入口

以下为2026-10-23实际完成，不是预计结果。不同套件可能涉及相同模块，不相加宣称独立覆盖总数。

| 级别 | 命令/范围 | 本轮结果 |
| --- | --- | --- |
| CONTRACT | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/verify-agent-workbench.ps1 -Scope Contract` | 18/18；生成API检查通过 |
| INTEGRATION | 同入口`-Scope Integration` | 35/35；真实隔离MCP/临时SQLite及DPAPI，不是BYOK |
| UNIT | `apps/quality-case-portal`下`npm.cmd test` | 41/41，5文件 |
| BUILD | 同目录`npm.cmd run build:agent` | 通过，类型及AGENT_API检查通过；保留654.29kB构建提示 |
| BROWSER | 同入口`-Scope Browser -Case All` | 5/5：Foundation2、History1、Conversation1、Models1；隔离数据/执行替身 |
| CLI REGRESSION | 产品锁定Node24执行`--test agent-cli/test/release-lifecycle.test.mjs agent-cli/test/journey-author-validate.test.mjs agent-cli/test/journey-execute.test.mjs agent-cli/test/journey-evidence-verify.test.mjs` | 49/49，约39.97秒 |
| 新增反例 | 锁定Node20执行下列审计文件；第二次仅运行`--test-name-pattern='S5-R0[789]'` | 第一组1通过/5失败；新增组3失败/6未重复运行。不同反例合计1通过/8失败；红测试是问题证据，不是验收通过 |
| LIVE_E2E | 本轮没有执行 | 当前环境未就绪；昨日失败报告保留 |

本轮工件根（本机，不包含原库/凭据）：

`C:/Users/fujunye/.codex/visualizations/2026/08/08/019fdf60-1f53-7333-a5cf-d2ea42e6b27a/rf068-s5-audit-20261023/`

- `s5-counterexamples.cjs`：审计源；加载未修改的实际应用/SQL/函数，以合成依赖隔离触发边界，不连接银行或模型。R08用通用证据形状探测S5缺失断言，不假装真实工件已验证。
- `counterexamples.tap`与`counterexamples-additional.tap`：原生失败断言/堆栈和测试汇总。第二次的6项skipped是未重复执行，不是未测试。
- `browser/foundation`、`browser/history`、`browser/conversation`、`browser/models`：当日浏览器JSON及截图。完整原LIVE失败截图和报告仍在原运行目录。

审计脚本是本机反例实验，不作为产品正式测试入口或可发布产物；修复时需将反例收归上述模块测试并去掉硬编码本机路径。现有回归通过并不抵消红测试。只有实现、复验和原机LIVE完成后才能称S5已修复。
