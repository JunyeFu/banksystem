---
id: DOC-AGENT-INTERVIEW-REPAIR-20261105
title: 两轮面试审计逐问题修复方案
document_type: reference
domain: architecture
status: active
authority: design
version: 1.0
effective_date: 2026-11-05
owner: project-owner
---

# 两轮面试审计：逐问题修复方案

## 范围与状态

基线为`main@e67fd4c`，输入是[第一轮审计](../../evidence/platform/agent-interview-audit-2026-11-05.md)、[第二轮审计](../../evidence/platform/agent-interview-audit-round2-2026-11-05.md)及两套已运行的反例。共9个已复现缺口F01–F09、1个媒体环境缺件E01；Q6/Q7的定向防线通过，不新增无验收需求的重构。

用户“按顺序完成”已授权本方案的实现、测试与复审。实施顺序只查[唯一顺序文件](../../../agent/plans/active/v54-implementation-batches.md#2026-11-05-面试审计修复候选顺序)，状态只查backlog的`BANKSYSTEM-INTERVIEW-AUDIT-REPAIR-001`。原RF068-S5的历史完成不改写，正式28项和整体GO不提升。

保持原银行容器、卷、日期和数据不动。仅在隔离环境开发、测试与迁移演练；源码修复、构建和复审全部收口后才统一冻结新身份，并按既有授权边界重载自有Agent及执行只读验收。修复后的新身份不能沿用旧身份的成功证据。生产路径不加入运行时Mock、备用模型、静默修JSON、隐藏重试或提案人工批准门。

路径简写：下文`P/`代表`platform/hengzhun-regression-system/`。路径清单是预期变更范围，不代表文件已经修改。执行前将切片与精确路径写入所属RF批次任务包；超过现有批次合同/迁移/模块预算时先补齐受控增量，不能借本方案修改已关闭批次的历史记录。

## 问题到修复的对应关系

| 面试问题 | 发现/状态 | 修复落点 | 完成判据 |
| --- | --- | --- | --- |
| Q1 计划与工具约束 | F01 / P1 | 业务值按字段绑定 | 余额900不能成为明确要求100的转账金额，错误候选到达MCP前被拒绝 |
| Q2 模型/工具失败 | F02 / P2 | 安全错误分类与传播 | 401、429、5xx、断网、超时/取消可区分，调用次数不增加 |
| Q3 凭据与上下文 | F03 / P1，仅直接CLI入口 | 复用现有敏感文本规则 | 明确明文凭据在持久化/模型/MCP前被拒绝；网页既有拒绝行为保留 |
| Q4 并发与恢复 | F04 / P1 | Harness单写入、revision条件写 | 两个写者不再两个成功却丢更新，旧检查点可受控迁入与恢复 |
| Q5 成功与成本 | F05 / P2 | 实际SDK输出预算 | 请求携带最多8192的输出上限；不靠配置对象或注释自证 |
| Q6 MCP协议 | 本轮定向通过 | 保留冻结目录/协议/鉴权测试 | 不增工具热插拔、宽松解析或namespace回退 |
| Q7 不可信工具数据 | 本轮定向通过 | 保留下载目的地与网页敏感文本防线 | 外域不调用，loopback改端口仍被固定，网页密码不入库/模型 |
| Q8 OCR/多模态 | F06、F07 / P2；E01环境 | 来源校验、一次筛选、固定媒体依赖 | 不补造来源、不隐式再调用，完整图像回归可真正运行 |
| Q9 长任务/取消 | F08 / P2，仅下载链 | 贯通HTTP到下载I/O的signal | 客户端取消后下游等待可结束；不冒充银行回滚 |
| Q10 发布与交付 | F09 / P1 | 同修清理生产者与验证器 | 别的run/身份、矛盾或被改回执均不能注册/判GO，合法回执仍可通过 |

## Q1 / F01：业务值语义绑定

### 实现步骤

1. 在候选作者化前，从用户原始目标及本任务补充中提取明确标注的付款账户、收款人、转账金额/币种和用途。沿用已接受的中英文表达，例如“转账100.00 CNY”和“转账金额：100.00 CNY”；不把余额、手续费、历史交易或任意UUID当作这些字段。
2. 同一字段缺失或冲突时进入既有NEEDS_INPUT。禁止默认选账户、取最后一个数字或让模型填空。用户已明确100而模型输出900属于候选绑定失败，不应反过来要求用户批准900。
3. 模型候选逐字段与明确输入比较，金额按现有十进制规则规范为等值比较，不用二进制浮点。仅全部一致时保留现有typed-business-inputs-v2与`USER_CONFIRMED`标识；不引入新人工批准步骤。
4. `journey_prepare`只接收已核对的值；原自然语言与候选来源绑定保留。其他银行API、幂等键、关联号、资金约束不改。

**路径：**`P/controller/src/journey-author.mjs`、`P/agent-cli/src/production-service.mjs`、对应作者化测试和`P/harness/src/i10/`中现有业务输入合同。若需要新提取函数，放在现有controller模块，不新建解析平台。

**验证门：**Q1原反例转绿；新增余额/手续费/历史金额混杂、多个收款人、冲突付款账户、合法等值金额与缺字段测试；错误绑定时model之后的MCP变更调用为0，合法既有目标仍可作者化。只读测试不产生资金动作。Harness与CLI两层分别测试，不用Schema绿灯代替语义证明。

## Q2 / F02：模型错误分类与传播

### 实现步骤

1. 在`createOpenAIJsonInvoker`读取SDK错误的受控HTTP状态，输出稳定代码族，例如`AGENT_ADAPTER_MODEL_HTTP_401/403/429/5XX`；断网仍为独立传输错误。保留已有超时、取消、非法响应和格式错误，不输出供应商message、正文、headers或URL查询参数。
2. 作者化服务、CLI终态/退出码、网页事件逐层保留该类型码；依赖故障继续使用既有未就绪退出语义，不能把401变成普通成功回复。
3. 保持`maxRetries: 0`。鉴权错误不重试；本包也不额外引入限流重试策略，交由用户按明确原因处理。

**路径：**`P/controller/src/runtime-adapters.mjs`、`P/agent-cli/src/production-service.mjs`、`workbench-application.mjs`及既有错误投影/测试。仅在传播确实丢码的接缝修改，不扩大全部异常体系。

**验证门：**真实锁定SDK＋临时HTTP端点覆盖401/403/429/5xx、断网、超时和取消；每个场景调用1次；F02转绿；从CLI到网页的安全码一致、无正文/密钥泄漏；已有非法JSON诊断继续通过。

## Q3 / F03：CLI凭据外发拦截

### 实现步骤

1. 提取网页Harness现有`secretPattern`为可被Harness与Node Controller消费的同一份固定规则；不让Controller导入Harness数据库/Service，不新增包或秘密检测服务。规则仅覆盖已建立的明确密码、API Key、Bearer等形态。
2. 在直接CLI的start、journeyAuthor、continue输入和targetSystem等模型文本字段进入会话事件/模型调用之前使用该规则。网页沿用同一规则，避免两个入口漂移。
3. 命中时返回既有`AGENT_SECRET_FORBIDDEN`安全原因并指向本地凭据登记；不把完整输入写日志再脱敏，不发送原文让模型判断。安全credentialRef继续保留在本地、从模型上下文移除。

**路径：**`P/harness/src/workbench-repository.ts`、`P/controller/src/journey-author.mjs`、`P/agent-cli/src/production-service.mjs`、产品contracts中的共享规则及所属测试。共享规则的归属须登记模块依赖，不新增跨层内部导入。

**验证门：**CLI和网页同一组合成样本均在持久化/外发前拒绝，model/MCP调用0、无敏感持久记录；“检查密码策略”“通过安全凭据登录”等正常目标不误拒。F03转绿；Q7网页拦截正例保持。范围仍不宣称能识别任意无标记秘密。

## Q4 / F04：共享检查点单写入与并发恢复

### 设计决定

把**共享检查点的权威revision与密文封套**交给现有Harness SQLite事务管理。DPAPI的保护/解密仍由本机客户端完成，Harness不解密；`ModelKeyStore`和凭据登记的`OperationStore`不因本缺口而一起迁移。它们没有本轮已证实的同类失败，不扩范围。

### 实现步骤

1. **存储/合同小任务：**增加专用的controller-session密文记录及repository；唯一键为namespace＋sessionId。创建唯一、更新以`expectedRevision`条件提交、成功递增revision。封套与查询索引处于同一事务，不再分别维护两个文件的当前状态。
2. **传输小任务：**经既有专用、非模型可见的MCP内部控制合同提供创建/加载/条件保存和元数据列表能力；namespace由服务绑定，不新端口，不把密文加入模型工具目录或Quality。仅回传必要字段。编码前用隔离既有检查点核对封套字节数与当前MCP/Harness请求和回包上限；不通过全局放大预算、裁剪快照或串接模型消息解决尺寸问题。若现有上限无法承载，先收口该存储合同设计，不提前切生产数据。
3. **客户端小任务：**`EncryptedSessionStore`改为该权威存储的客户端，不直接打开SQLite。`EncryptedSessionCheckpointer`记录它实际加载的revision，串行提交本实例快照；另一写者使基线过期时返回`SESSION_REVISION_CONFLICT`，不得重新加载后盲盖快照，也不重派银行动作。
4. **旧数据迁入小任务：**在隔离根一次性读取旧`.hzs`封套和index，验证当前用户DPAPI可读、绑定及revision；导入后逐项回读对等，再演练重启。实际切换前保存原文件，显式执行一次导入。新运行链只读新存储；旧文件仅保留恢复/历史，不加启动时自动双读、双写或回退。

**路径：**`P/harness/src/`的会话repository/合同、`P/harness/migrations/`一项新迁移、`P/mcp/src/`及专用MCP合同、`P/controller/src/session-store.mjs`、`session-checkpointer.mjs`、`controller-runtime.mjs`、CLI生产接线和一次性迁入脚本。后台、客户端、迁入三个任务分别验收，每次遵守所属批次最多两模块的范围，不一次性跨全层切换。

**验证门：**两个真实Node进程同session竞争，只能“全部更新被保留”或“一方明确冲突”，不能两个成功却丢数据；创建/列表也不得丢条目。修订原F04反例的同步屏障，不能要求修复后的两个mutator必然同时进入临界区；保持不丢更新的判据，不以改绿状态代替修复。重启可恢复同一Journey；旧数据原件不变；错误身份/namespace仍被拒绝；既有submission只领取一次和历史不重派继续通过。

**迁移与恢复门：**先隔离演练，不在原Harness库试跑。切换前确认自有Agent无活跃任务并保存检查点/数据库恢复点；恢复只使用原副本及原身份，不删除迁移证据，不触碰银行数据。存储迁移是本包唯一预期数据库结构变化，需更新所属RF预算后才能执行。

## Q5 / F05：落实模型输出预算

### 实现步骤

1. 在唯一JSON模型适配器对锁定ChatOpenAI配置明确设置输出上限8192，按实际协议生成`max_tokens`或`max_completion_tokens`；不增加多套供应商回退分支或新的用户配置项。
2. 保留当前输入最小化、JSON模式、无工具、零重试和finish_reason/usage证据。截断仍是可见失败原因，不自动拼接补全或扩大预算重跑。
3. 将设置落实到实际SDK HTTP包的测试；模型工厂参数测试只能作补充。真实延迟、Token消耗与成功率仍需后续正式场景测量，不在本包写优化比例。

**路径：**`P/controller/src/runtime-adapters.mjs`和对应SDK/作者化测试。

**验证门：**F05转绿；实际请求有正整数上限且不超过8192；合法JSON仍能返回，预算截断原因可追踪；已有timeout、取消和JSON错误分类保持。

## Q6、Q7：只保留已验证防线

不增加SSE、工具热插拔、额外审批、通用注入分类器或安全服务。保留第二轮Q6的目录漂移/协议结果/鉴权/namespace反例，以及Q7的外域下载拒绝、origin固定、网页敏感输入拦截。

F03共用规则、F04新MCP合同、F08下载signal可能影响这些边界，因此相关改动后重跑这几项即可；不能以“支持取消”放宽下载目的地，也不能为内部会话存储开放模型可调用的秘密读取工具。

## Q8 / F06、F07及E01：图像事实与媒体环境

### F06：来源校验

1. `normalizeFact`对缺失、空或不属于本次packetRefs的引用给出明确拒绝；包含无效引用的混合集合也不能悄悄修正成另一来源。删除“取第一张图补引用”行为。
2. 仅已核对来源的事实进入后续确认/执行；未通过的事实不落为“有效来源”。这只证明引用归属，不谎称已经证明OCR文本与事实语义完全一致。
3. 验证合法单图、多图分别引用、未知/缺失/混合引用；F06反例转绿。若采用明确错误而非丢弃事实，反例应验证该确定的失败语义，不固化为必须返回空数组。

### F07：一次筛选

1. 删除`selectCaseFacts`内部第二次模型调用及追加“重新检查”的提示。
2. 一次返回空facts时保留该次usage/结果，交现有`I10_IMAGE_FACTS_EMPTY`路径失败；需要重试由新的显式操作触发，不隐藏在当前任务内部。
3. 更新既有“必须调用两次”的旧测试为一次调用/明确空结果；F07与F06共同回归，避免来源过滤为空后再隐式调用。

**路径：**`P/worker/src/i10-image-ingest-runner.cjs`及`P/scripts/verification/image-multimodal-ingest.test.cjs`、图像事实/交付测试。不得引入视觉OCR回退，也不修改银行页面去迎合识别。

### E01：补齐固定媒体依赖

1. 沿已有`prepare-agent-media.ps1`与`config/demo-runtime-freeze.json`核对固定下载源/本地缓存、压缩包和可执行文件摘要、版本及许可证；只安装冻结的9.0.2，不改freeze，不冒用浏览器ffmpeg。
2. 安装目标仅为`P/runtime/media/ffmpeg-9.0.2/`。不清理其他runtime、缓存或原银行卷；不执行完整prepare/down/reset来修一个媒体依赖。
3. 用有效/损坏合成图像验证真实解码，再运行此前受阻的四项。它们必须真正到达OCR/筛选断言，不得skip或用假二进制通过。只读确认Worker媒体就绪不等于新身份LIVE。

**验证门：**两套新增审计的图像反例转绿；既有图像9项在更新旧重试预期后全部满足当前合同，缺FFmpeg不再遮挡用例。安装不会改变任何银行业务状态。

## Q9 / F08：仅修下载取消链

### 实现步骤

1. 原生HTTP层监听请求被中断及响应连接提前关闭，取消该请求的AbortController；正常响应结束不误判为取消。
2. 仅为需要取消的下载路径贯通`signal`：HTTP路由→`downloadAgentArtifact`→证据读取/下载许可MCP→`createArtifactProxy`的fetch及响应体读取。signal是内部调用参数，不写入公开JSON DTO或持久状态。
3. 取消立即结束下游等待并释放读取资源；不新增隐藏重试，不把它解释为撤销已提交的银行动作或强制结束Worker。

**路径：**`P/agent-cli/src/workbench-server.mjs`、`workbench-http.mjs`、`workbench-application.mjs`、`workbench-production.mjs`及HTTP/服务器测试。

**验证门：**F08转绿；真实HTTP客户端在许可等待、响应头等待和响应体读取阶段断开均能传递取消；正常下载的大小/摘要验证、外域/重定向拒绝保持。使用可受signal终止的受控挂起端点证明，不只检查“参数里有signal”。现有停止/未知结果与历史不重派回归保持。

## Q10 / F09：清理生产者与唯一发布验证器闭环

### 实现步骤

1. 在测试包装脚本创建任何临时身份/Fixture之前分配本次runId、cleanupId与冻结身份，传给子驱动，避免父清理和子报告各自产生无法对应的runId。
2. 定义一个严格的清理回执合同：`schemaVersion`、`cleanupId`、`runId`、`releaseIdentityHash`、`status`、本次拥有的资源及其清理结果、`failures`。只保存合成资源的不透明引用，不存密码/token。COMPLETED要求失败集合为空，全部拥有资源都有已删除/原已不存在的结果；空资源集合仅适用于确实未创建资源的运行。
3. 父包装脚本在finally完成清理后封存回执，并将其摘要写入最终报告`cleanupSha256`，再允许认证登记。子驱动提前结束时保留失败/待清理状态，不能用占位COMPLETED换GO；已登记终态报告不得事后重写。
4. `ReleaseVerification`严格校验结构、run/cleanup/身份对应、资源集合与状态一致性、回执摘要及文件变更；登记和最终verify均执行同一校验。当前形状过时的历史报告只作历史，不加“旧版跳过验证”外壳。
5. 更新生产者、报告schema、合法测试夹具与两类负例；合法夹具使用新合同，不是放宽消费者来保留旧绿灯。仅调整必要的发布证据形状，不改银行业务API和Quality只读性。

**路径：**`scripts/test/rf057-bank.ps1`、`scripts/test/rf057-agent.mjs`、`scripts/test/rf057/bank.mjs`、`scripts/test/rf057/evidence.cjs`、清理合同/测试、`P/harness/src/release-verification.ts`及`P/scripts/verification/rf057-release-verification.test.cjs`。

**验证门：**F09两类反例均拒绝；补充schema缺失、错误run/身份、资源漏项、COMPLETED却failures非空、登记后篡改回执、清理中断。真实匹配的合法清理仍能让隔离小清单通过；再用正式28项清单验证缺任一必要项为NO_GO。小清单GO不能当成正式产品GO。

## 分级验收与交付条件

1. **STATIC/CONTRACT：**文档/合同生成校验、两套审计反例、实际SDK本地HTTP、字段绑定与错误传播；所有9个反例在保持判据的前提下转绿。Q6/Q7没有新增能力诉求。
2. **INTEGRATION：**临时SQLite/MCP/真实双进程CAS、旧检查点迁入/恢复、原生HTTP断连、真实FFmpeg解码与清理生产者/验证器接线。只操作隔离根，不在原银行做资金场景。
3. **复审：**另轮按合同和反例复读跨层实现，特别检查是否只改测试桩、是否实际生效于SDK/原生HTTP、是否又产生双写/回退；如为同一执行者，明确不是独立第二人或人工验收。
4. **LIVE_E2E：**全部源码/合同/构建与迁移方案收口后一次冻结新身份，核对沿用授权的范围，运行S5真实BYOK只读及浏览器/历史/下载复验。失败则封存本次结果，定位修复后以新身份从该清单起点再测，不在产品内自动重试。运行服务、模型配置与数据环境都满足才执行；不能用旧S5代替。
5. **发布：**正式28项、安全镜像/许可/远端CI仍按RF057/RF065既有门，不由本轮修复自动关闭。不自动推送、公开仓库或创建Release。

建议检查入口仍为两套`agent-interview-audit*.test.mjs`（各自使用已声明Node ABI）、`verify-agent-workbench.ps1 -Scope Contract/Integration`、所属Controller/图像/发布测试和`python scripts/docs/validate_docs.py`。不为文档方案重跑未变化的整仓用例。

## 本轮落盘回执

### 授权执行增量（2026-11-05）

复用 RF066-S2、RF067-S1 与 RF057 的既有能力归属，不重写历史完成记录。各任务的精确文件以本方案对应问题的路径清单为白名单；新增共享规则限 `P/contracts/security/sensitive-text-v1.json`，新增解析限 `P/controller/src/explicit-transfer-input.mjs`；身份清单仅登记新增源码，不在中途冻结。每组上限：20 个改动文件、8 个新增文件、2000 行；F04 后台/客户端/迁入分开执行，新增迁移仅一项。

| 任务 | 所属增量 | 输入／产出与验收 |
| --- | --- | --- |
| 输入边界 F03/F01 | RF066-S2，RF067-S1共享规则消费 | 原反例→调用前拒绝；作者化和边界测试通过。已实现，20/20；Q1/Q3反例5/5，尚不计LIVE |
| 发布回执 F09 | RF057 | 父子run绑定、严格回执、摘要封存；合法和篡改反例共同验证 |
| 检查点 F04 | RF067-S1后台→RF066-S2客户端→隔离迁入 | 先核对尺寸，再CAS、双进程竞争及恢复；原库不迁移 |
| 模型 F02/F05 | RF066-S2 | 实际SDK HTTP错误分类和8192输出预算，调用一次 |
| 媒体 F06/F07/E01、下载 F08 | RF066-S2既有Worker与HTTP边界 | 固定FFmpeg、来源拒绝、一次模型调用、原生HTTP取消回归 |

本增量的控制文件允许更新本方案、所属任务包/批次、backlog及唯一顺序；测试白名单为两套审计、对应既有验证文件和必要的新回归。不启停银行、不提交推送。最终证据统一记录 `agent/runs/interview-repair-20261105/`；未完成的行不改为完成。

规划时（执行授权前）只形成修复设计与候选实施顺序，任务为PROPOSED，尚无修复或运行证据；该历史回执不代表授权执行后的当前状态。

### 源码与隔离验证收口

F01–F09已实现，固定FFmpeg 9.0.2按锁定摘要安装。第一轮审计12项、第二轮12项通过；CLI/Controller相关合并回归86项、图像12项、发布验证及摘要生产者34项、真实HTTP下载/既有边界42项通过（集合存在重叠，不相加宣称唯一总数）。PowerShell原清理函数在无网络测试进程验证成功与失败两例。Workbench Contract 19+12、Integration 41+2通过；追加的SQLite会话及错误传播回归22项通过。证据在 `agent/runs/interview-repair-20261105/`。

F04迁移容量：原101份密文最大25613字节；专用合同封套120KiB/回包128KiB，未扩大既有全局预算。原子revision与密文在同一SQLite行，两个真实Node进程经生产MCP竞争仅一个成功；另一方明确SESSION_REVISION_CONFLICT。仅同一Controller的提案暂存成功、且前序版本相邻时接续本地检查点版本；不重载别的写者状态后覆盖。隔离迁入保留原revision、密文和Journey并可回读；隔离门结束时原库尚未切换，原.hzs及index保持不动。后续切换、复审与新身份运行见下节，不用隔离结果替代LIVE。

### 真实运行跟进

原库已在备份后切至045，101份密文导入且原文件合并摘要不变。S5依次暴露通用异常诊断缺失、停留/禁止条款被编为点击，以及标题/Skeleton误作账户字段就绪；另在复审补齐编译敏感规则的身份覆盖。均按现场反例补最小实现与测试，前者旧异常根因不作伪称确证。源码跟进路径归既有RF057-S3任务，具体证据和各身份结果见[修复回执](../../evidence/platform/agent-interview-repair-2026-11-05.md)。原F01–F09、隔离证据和后续真实运行分开记录；正式28项不提升。

最终出口：补齐明确银行字段观察所需的账户页导航展开，98项相关回归通过；H1c76996e…ca3e94d真实只读S5十阶段完整通过、前后身份相同、银行快照不变、原101份文件摘要未变。命令退出0及不可变运行目录见修复回执。此次修复链已满足出口，backlog登记完成；本结论不等于正式28项或整体GO。
