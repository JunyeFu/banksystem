---
id: DOC-AGENT-INTERVIEW-AUDIT-R2-20261105
title: Agent 实习面试第二轮五类问题与审计测试
document_type: reference
domain: platform
status: draft
authority: evidence
version: 1.0
effective_date: 2026-11-05
owner: project-owner
---

# 第二轮：再补五类面试追问，逐项审计与测试

## 结论与范围

延续[第一轮](agent-interview-audit-2026-11-05.md)，源码基线仍为`main@e67fd4c`。保留第一轮未跟踪文件，不实施其修复，不提交/推送，不冻结身份，不运行正式LIVE。本轮只新增测试与报告，并根据新实测收窄第一轮F03的影响范围。

Q6–Q10共12项审计：**8通过、4失败，确认4个新增缺口F06–F09**。Q6/Q7的定向边界测试通过，没有为凑满五个漏洞制造缺陷。另有媒体环境E01导致既有图像回归4项未通过，不能算成4个源码漏洞。

测试仅使用临时SQLite、临时HTTP服务、合成OCR文本/模型回复及受控下载桩；外网模型调用0次，没有启动真实浏览器任务或调用银行业务API。15个原银行容器保持运行，未启停、替换、改卷或日期。没有将隔离测试里的GO写入原Harness、Quality或backlog。

## 问题与网络依据

以下是从面经考点扩展的项目追问，不声称统计排行或公司官方原题。技术判据优先采用官方资料。

| 新问题 | 依据及与上一轮的区别 |
| --- | --- |
| Q6：MCP与普通函数调用有什么不同？协议、工具目录变化和身份边界如何验证？ | [实习面经中的MCP/Skill及工具稳定性追问](https://api-cdn.nowcoder.com/feed/main/detail/ed5e9d17f26e489da94afbf1241b885e?sourceSSR=post)；技术标准参考[MCP工具协议](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。不是再问Agent架构，而是检查协议结果与工具目录边界。 |
| Q7：如果网页/工具返回恶意指令，怎样阻止越权和外传？ | [公开Agent安全问答](https://www.nowcoder.com/discuss/916878391259717632?urlSource=sitemap)涉及不可信工具与数据面；技术标准参考[MCP安全最佳实践](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)。不把隐去密码或Prompt提醒当成完整防线。 |
| Q8：OCR、多模态输入怎样变成可信事实？错误来源如何处理？ | [AI全栈实习一面](https://www.nowcoder.com/discuss/913848724952997888)明确涉及OCR、多模态链路。这一轮检查图像事实来源和图像分支行为，不重复上一轮文本上下文题。 |
| Q9：长任务怎样把进度给前端？停止或断连后资源是否释放？ | [AI全栈面经](https://www.nowcoder.com/discuss/913848724952997888)有分阶段返回/SSE追问；[MCP取消规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation)说明取消请求不等于已完成工作被回滚。本项目按已有轮询/事件接口测试，不为答题硬加SSE。 |
| Q10：本地跑通以后，如何确认候选交付的证据真实、归属正确？ | 从项目落地追问延伸到当前发布验证器；[GitHub工件证明说明](https://docs.github.com/en/actions/concepts/security/artifact-attestations)强调验证来源，而不只是生成标记。本轮不引入新的签名系统，只检查已有清理与发布闭环。 |

## Q6：MCP协议、动态目录与身份边界

### 面试答法

MCP是工具发现/调用的标准协议，不替代业务API授权。当前使用bearer认证的loopback Streamable HTTP、冻结工具合同和服务器绑定namespace；没有开放任意第三方工具的热插拔能力。工具变化要重新核对合同与候选身份，而不是发现了就自动执行。

### 本轮实际测试：3项通过

1. 向真实合同增加未声明ACTIVE工具，`validateToolPolicy`报`AGENT_CONTROLLER_TOOL_POPULATION_MISMATCH`。
2. 两个text块、数组structuredContent、JSON null这三类不符合本项目机器合同的结果，真实适配器均拒绝为`AGENT_ADAPTER_MCP_RESULT_INVALID`，没有随意取一个答案。
3. 隔离的实际Harness HTTP元数据边界对缺bearer返回401、外来namespace返回403；没有创建会话记录。

涉及`controller/src/tool-policy.cjs`、`controller/src/runtime-adapters.mjs`及Harness/workbench生产代码。本轮未发现这些定向场景的新缺陷；不外推为任意第三方MCP服务均可信，也没有以测试桩宣称完整MCP互联网互通。

## Q7：不可信内容、越权与外传

### 面试答法

把工具返回值视为数据，执行能力与网络目的地由代码约束。命令式文件名不产生新权限；下载许可也不能把下载目标切到外网。仅Prompt提示不能证明抗注入率，需要分别测试模型行为与模型外的硬边界。

### 本轮实际测试：2项通过

- 恶意工件许可把href改成外部域名时，`createArtifactProxy`在fetch前拒绝，网络调用0次。将有效许可改到另一个loopback端口并塞入命令式displayName时，下载仍固定在配置的Harness origin、`redirect: error`；文件名没有改变请求目的地。
- 用实际`createWorkbenchApplication → WorkbenchRepository`提交合成明文密码，得到`AGENT_SECRET_FORBIDDEN`，turn记录0条、模型调用0次。

### 对第一轮F03的范围修正

第一轮实测的外发路径是**直接CLI `createProductionService.journeyAuthor`**；仅证明网页DTO接受字符串，不证明完整网页路径已泄漏。网页Harness已有敏感文本拦截。本轮将这条防线补测并回填第一轮报告，CLI入口缺口仍未修复。不能从本轮两个硬边界测试，宣称真实模型已通过网页提示注入、越权操作或语义攻击的全面红队评估。

## Q8：OCR事实来源与多模态失败

### 面试答法

图像解码、OCR识别、模型筛选、事实来源验证、业务执行是不同层。识别出文字不等于文字真实或可执行；引用必须来自对应图片，不能靠模型自报或缺引用时自动补一个。当前运行链有本地OCR与控制模型筛选，不应把它描述成所有图片都由视觉模型直接理解。

### F06 / P2：无效图像来源被静默改绑

- 根因：`worker/src/i10-image-ingest-runner.cjs:85`先过滤不在packetRefs里的引用；过滤后为空，却改为第一张图片的引用，而不是拒绝/标记无来源。
- 实测：合成模型返回`image:999:unrelated-source`，真实`selectCaseFacts`接纳1条事实，改写为`image:1:bbbb…`。这不是证明OCR真的读到了它；测试只捕获筛选边界，未驱动银行操作。
- 正例：引用确属输入图片的事实会保留原引用，调用次数1。
- 修复步骤：无来源或外来来源直接拒绝该事实/本次筛选；不虚构替代来源；再验证合法、多图交叉、未知/缺省引用，保证进入确认/执行链的每条事实都有真实对应来源。与F07一起回归，避免过滤成空后又自动调用模型。

### F07 / P2：图像事实为空时仍存在隐式模型重试

- 根因：同文件`:95–105`最多循环两次，空facts触发额外提示后再请求模型，最终只给出汇总调用证据/用量；这与当前不做隐藏重试的产品边界冲突。
- 实测：OCR输入含正常页面文字，合成模型连续返回空数组；实际fetch边界被调用2次，最终facts为空，输出Token被合并为6。
- 既有`image-multimodal-ingest.test.cjs`甚至明确要求重试一次并通过；这是旧测试固化了旧行为，不是当前产品要求已经满足。
- 修复步骤：一次筛选为空时给出明确原因并交人工/显式任务级重试；删除内层自动第二次请求；更新旧的两次调用测试，使本次反例转绿，不增加备用模型或自动补事实。

### E01：本机图像回归的独立环境缺件

配置要求`runtime/media/ffmpeg-9.0.2/bin/ffmpeg.exe`，本机该文件不存在。浏览器自带的`runtime/browsers/ffmpeg-1011/ffmpeg-win64.exe`存在，但不是同一个固定媒体依赖，不能自动冒用。

既有图像回归9项中5通过、4失败，四个失败均在`I10_FFMPEG_MISSING`处被拦截，尚未到达各自预期OCR断言。本轮不下载、不安装、不改版本/配置，不声称图像端到端可用。后续依据已有`scripts/deploy/prepare-agent-media.ps1`补齐并核验固定媒体依赖后，再重跑这四项；不要把缺依赖改成fallback或跳过测试。

## Q9：前端进度、停止与资源释放

### 面试答法

网页展示带序号的工具事件和状态回读，不是模型隐藏思维链。任务读取不能隐式续跑；停止Controller等待不证明Worker已取消或银行业务已回滚。非变更下载请求的取消则应贯通到下游I/O，释放等待资源。

### 已通过场景

读取一个没有当前进程拥有的RUNNING记录，真实工作台将其标记`INTERRUPTED / AGENT_PROCESS_INTERRUPTED`，没有创建执行服务或重派任务。

### F08 / P2：证据下载取消未传到下游

- 根因：`agent-cli/src/workbench-http.mjs:89`未把request.signal交给普通/下载路由；`workbench-application.mjs`下载调用没有接收/传递signal；`workbench-production.mjs:66`的fetch也没有signal。
- 实测：使用真实HTTP路由器和真实工件代理、受控挂起fetch。调用方AbortSignal已取消，但下游signal缺失，30ms观察窗后仍在等待，直到测试手动释放。30ms仅为有界测试观察，不是产品性能阈值，也没有验证真实断线多久会触发传输层默认超时。
- 影响仅限本次证据下载取消链，不等于任务停止完全失效，更不等于已证明重复银行写入。
- 修复步骤：原生HTTP连接关闭/调用方取消触发本次请求signal；下载路由→工件服务→MCP许可请求/fetch/响应体读取贯通signal；受控挂起下载必须可终止，正常大小/摘要校验保持。不要将此修复误作取消已提交银行业务的承诺，也不增加盲目重试。

## Q10：发布证据归属与候选交付

### 面试答法

发布结论应由既有验证器结合候选身份、正式清单、工件及运行事实给出。能返回GO不等于验证器正确；需要用“借用其他运行的证据”“内容互相矛盾”等反例检验。不能把一个PASSED/COMPLETED标签当作证明。

### F09 / P1：清理回执只相信COMPLETED标签

- 根因：`harness/src/release-verification.ts:63–64`仅解析cleanupRef文件并检查status，没有校验清理schema、run/候选身份归属或failures与status一致性。当前清理生产者`scripts/test/rf057-bank.ps1`也尚未写入run/身份绑定，修复必须同时覆盖生产与消费，不能只加拒绝规则锁死所有正常报告。
- 实测：独立临时产品根/SQLite、单B07场景下，两类回执均获注册并得到隔离验证器GO：①其他identity和run的COMPLETED回执；②COMPLETED但failures非空的矛盾回执。
- 正例：明确FAILED的清理回执能阻止注册。
- **这不是当前正式28项已经被绕过或整体变成GO**。使用单场景临时清单是为了定位清理校验边界；原Harness/Quality/银行未被修改，用户原发布结论不变。
- 修复步骤：清理生产者明确绑定run、ReleaseIdentity及本次拥有的资源，生成一致的成功/失败记录；现有唯一发布验证器校验严格结构、归属、失败集合和已登记证据一致性；增加借用/篡改/失败未清理反例，同时保持合法清理可注册。不新增第二个发布控制面，不仅靠人工编辑status过门。

## 可复现命令与结果

[新增审计源码](../../../scripts/test/agent-interview-audit-round2.test.mjs)：

```powershell
# 需要本产品的Node20原生SQLite ABI；当前应退出1，因为4个缺口尚未修复。
& .\platform\hengzhun-regression-system\runtime\node-v20.20.2-win-x64\node.exe --test scripts/test/agent-interview-audit-round2.test.mjs
# 逐题执行可加 --test-name-pattern '^Q6'，依次到 '^Q10'。
```

| 范围 | 本轮实际结果 | 回执（本地，不上传生产状态） |
| --- | --- | --- |
| Q6–Q10新增审计 | 12项，8通过/4失败，exit1，无跳过 | `agent/runs/interview-audit-20261105-round2/counterexamples.tap` |
| 工件/HTTP路由及静态服务既有回归 | 16通过/0失败，exit0 | 同目录`http-regression.tap` |
| 图像筛选、事实决策与交付既有回归 | 9项，5通过/4失败，exit1；四个失败根因为缺FFmpeg | 同目录`image-regression.tap` |

Q9测试编写时曾使用错误的工件ID形状，触发路由拒绝；已按真实`art_<uuid>`合同修正，该原型错误不计产品缺陷。表中为修正后的最终实际结果。未修改生产源文件，因此不重跑上一轮全部134项，也不把它们重复累计为新增验证。

修复优先看F09发布门、第一轮F01/F03/F04，再收口图像F06/F07及下载F08；E01是恢复图像完整回归的前置环境门。两轮共10类问题、9个已复现源码/产品合同缺口，外加1个独立媒体环境缺件。审计完成不等于修复或发布完成。
