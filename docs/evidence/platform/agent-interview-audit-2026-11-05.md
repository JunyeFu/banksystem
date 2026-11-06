---
id: DOC-AGENT-INTERVIEW-AUDIT-20261105
title: Agent 实习面试五类问题驱动的代码审计与测试
document_type: reference
domain: platform
status: draft
authority: evidence
version: 1.0
effective_date: 2026-11-05
owner: project-owner
---

# Agent 实习面试五类问题驱动的代码审计与测试

## 本轮结论与边界

审计基线：`D:\Agent\banksystem`，`main@e67fd4c91056414b1cc4fee64d5aa7c67a411e93`；开工时工作区干净。逐项读当前生产调用链，再执行反例，不以 README、历史 S5 或测试数量替代代码证据。

新增审计测试共11项：**6项通过、5项失败，对应5个独立缺口**。失败断言表达应有的边界，不把复现漏洞写成绿色通过。已有控制器、工作台、评估和发布验证回归结果独立列在末尾。

本轮仅审查、补测试与报告，**没有修复生产代码，没有提交/推送，没有冻结身份或启动正式LIVE**。只读查看了15个原银行容器的状态；未启停/替换它们，未请求银行业务接口、写银行库/卷或推进日期。模型外网调用0次；SDK协议测试连接临时loopback HTTP端点，候选及密钥均为测试进程内合成值；并发测试使用隔离文件和真实Windows DPAPI。它们是CONTRACT/INTEGRATION证据，不是真实模型成功率、性能基准或正式28项通过。

## 网上问题如何选取

没有可靠的全网频次统计，以下是公开面经中重复出现、又适合本项目的五类归纳，不冒称统计意义的TOP5。

| 问法 | 来源与本次检查范围 |
| --- | --- |
| Q1：为什么是Agent而不是工作流/Function Calling？谁决定计划，工具权限如何控制？ | [牛客Agent开发面经](https://api-cdn.nowcoder.com/discuss/922659809084571648?sourceSSR=post)包含Agent理解、ReAct/Plan-Execute、工具设计等追问；[Anthropic架构区分](https://www.anthropic.com/research/building-effective-agents)用于校准实际架构，而不是只按用了哪个框架命名。 |
| Q2：模型给出非法JSON、错误参数，工具或模型调用失败时怎么办？ | [牛客实习面经索引](https://www.nowcoder.com/discuss/864153617182355456)的搜索摘要明确涉及工具调用失败/重试；该页正文未在本次抓取中完整返回，不据它编造详细答案。技术判据采用[官方工具设计说明](https://www.anthropic.com/research/writing-tools-for-agents)：可操作错误信息和真实结果核验。 |
| Q3：上下文/短长期记忆如何管理，凭据与会话如何隔离？ | [牛客携程AI应用开发面经](https://www.nowcoder.com/feed/main/detail/2b1c35eace4a4bb3bd88ee669f163793)列出上下文、压缩阈值及写权限；[LangGraph持久化说明](https://docs.langchain.com/oss/javascript/langgraph/persistence)区分线程检查点与跨线程存储。 |
| Q4：刷新、进程中断、并发请求后如何恢复，怎样避免重复副作用？ | [携程面经](https://www.nowcoder.com/feed/main/detail/2b1c35eace4a4bb3bd88ee669f163793)涉及异步与一致性；[LangGraph持久化说明](https://docs.langchain.com/oss/javascript/langgraph/persistence)明确检查点与故障恢复用途。本项目进一步检查CLI/网页共同运行时的恢复状态。 |
| Q5：如何证明业务成功，成功率、延迟、Token成本怎么测？ | [牛客Agent开发面经](https://api-cdn.nowcoder.com/discuss/922659809084571648?sourceSSR=post)含效果/上线指标追问；[Anthropic评估说明](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)和[工具评估说明](https://www.anthropic.com/research/writing-tools-for-agents)用于区分环境结果、过程指标及错误数。 |

以上面经是个人公开记录，不是公司官方题库；技术实现结论以下面的本地源码与实测为准。

## Q1：受约束Agent的业务参数真的受约束吗？

### 面试时应如实说明

本产品是受约束的测试作者化/浏览器执行系统，不是任意工具自治的通用Agent。自然语言生成候选，MCP/Harness控制状态与工具，Worker作者化并验证脚本，正式回归运行已验证脚本。网页主链`createProductionService`直接调用候选作者和受控执行流程；不能仅因为仓库有LangGraph图，就将所有入口描述成自由ReAct循环。

### F01 / P1：金额只做全文出现检查，可能把余额绑成转账金额

- 来源：`controller/src/journey-author.mjs:99`只对付款账户检查字段标签，`:103`对其余业务值仅做全文正则出现检查，`:139`直接标记`source: USER_CONFIRMED`。路径均相对`platform/hengzhun-regression-system/`。
- 反例：用户明确写“付款账户3当前余额900.00，本次转账金额100.00 CNY”。合成模型选择900.00。
- 实测：候选未拒绝，标记USER_CONFIRMED；通过真实`createProductionService.journeyAuthor`后，截获的`journey_prepare`参数仍是900.00。测试在MCP发送边界截断，**没有证明已发生错误转账**。
- 已成立的防线：未知`shell_exec`被拒绝，调用次数0；原文根本没有的999.00也被拒绝。缺口是字段语义绑定，不是工具白名单全部失效。

### 最小修复步骤与退出条件

1. 在模型调用前从用户明确的字段/补充输入建立业务值约束，区分余额、金额、账户、收款人；有歧义则NEEDS_INPUT，不由模型补值。
2. 模型候选逐字段与该约束比较；不一致在`journey_prepare`前失败，不能以“原文含这个数字”作为确认。
3. 增加多金额、历史交易、余额/手续费混杂和合法目标测试；F01应转绿，错误绑定时MCP变更调用为0，公开转账接口不变。

## Q2：失败分类是否能指导人工处理？

### 面试时可证明的部分

JSON模式和严格Schema同时存在；格式错误会被拒绝并给出不含模型正文的安全原因，格式诊断保留finish reason和用量。没有隐藏模型重试、自动修JSON或备用模型。不能回答“开JSON模式就不会出错”。

### F02 / P2：模型401和429被折叠为同一传输错误

- 来源：`controller/src/runtime-adapters.mjs:176–183`将非自定义异常统一转为`AGENT_ADAPTER_MODEL_TRANSPORT_FAILED`。
- 实测：使用实际锁定的ChatOpenAI SDK连接两个临时HTTP响应，分别为401、429；每种只调用1次，但两者返回相同错误码。与当前doctor能区分HTTP状态的行为不一致。
- 影响：用户无法根据任务失败原因判断应更换凭据还是等待额度/限流恢复；这里未证明系统在失败后产生银行副作用。

### 最小修复步骤与退出条件

1. 从SDK异常的受控数值状态提取鉴权、限流和服务端错误，保留原有超时/取消分类，不复制message、正文或headers。
2. 让类型码经作者化、CLI退出结果、MCP/网页事件保持一致；不增加自动重试。
3. 用真实SDK本地HTTP覆盖401/403/429/5xx和断网，保证分类不同且无密钥/供应商正文泄漏；F02转绿。

## Q3：隐藏API Key，是否就意味着模型上下文无凭据？

### 面试时应说明的边界

历史会话存在不等于把全部历史塞给模型；当前网页主链只传本任务及NEEDS_INPUT补充链。加密会话用于线程恢复，不能直接称为已实现“长期经验自主进化”。仓库开发RAG不属于交付产品运行时。

### F03 / P1：自由文本密码可穿过生产模型调用边界

**第二轮补充复核：范围限定为直接CLI作者化入口。** 真实网页→Harness元数据链已存在`WorkbenchRepository.assertSafe`，包含明确密码字段的网页消息会在持久化和模型调用之前被`AGENT_SECRET_FORBIDDEN`拒绝。第二轮已实测模型调用0次、turn记录0条。上轮“网页Schema接受”只指HTTP DTO本身，不代表网页全链路可泄漏；`createProductionService.journeyAuthor`绕开该元数据提交路径，所以上轮CLI边界反例仍有效。修复应复用网页已有规则覆盖CLI，而不是把网页防线当成不存在。见[第二轮复核](agent-interview-audit-round2-2026-11-05.md)。

- 来源：`controller/src/journey-author.mjs:90`仅替换形如`credential_…`的引用，然后把剩余goal和targetSystem交给模型；`agent-cli/src/workbench-contract.mjs`的消息输入仅有字符串/长度约束。
- 实测：合成输入“密码：SYNTHETIC_PASSWORD_NOT_A_REAL_CREDENTIAL”被网页Schema接受，候选作者收到它；真实`createProductionService.journeyAuthor`构建的模型messages也含该标记。
- 没有调用真实供应商或发送任何真实密码；确认的是**外发边界缺口**，不是已证实的真实凭据泄漏事件。
- 正例：安全credentialRef会从模型上下文删除，并继续在本地草案保留。

### 最小修复步骤与退出条件

1. 复用网页Harness已有的明确凭据规则，在CLI消息进入持久化与模型调用之前同样拒绝明文密码、Authorization和API Key，提示通过已有本地凭据登记入口绑定。
2. 同一规则覆盖CLI目标、网页消息、补充输入和targetSystem；不要仅改提示词，也不向模型发送待脱敏原文。
3. 测试中用合成标记验证拒绝发生在model/MCP调用前；验证普通“检查密码策略”等非凭据任务不误拒，安全引用仍可使用；F03转绿。不能把有限规则宣传为能识别任意无标记秘密。

## Q4：原子写文件是不是等于并发安全？

### 已有防线

同一存储实例的更新队列有效，跨ReleaseIdentity读取被拒绝。工作台集成回归还证明了隔离Harness中多个Node进程对同一submission只能领取一次，刷新/历史读取不会重派。不能将下面的检查点问题夸大为“已发生重复转账”。

### F04 / P1：不同会话存储实例存在丢更新

- 来源：`controller/src/session-store.mjs:154`的mutationQueue只属于一个JS实例；`:281–294`按“load→改对象→rename”更新，没有跨实例版本条件写。CLI与网页分别创建`EncryptedSessionStore`，可指向相同sessionRoot。
- 实测：两个实例加载相同revision=1，用受控同步屏障先后写入事件A、B。两个调用均成功，最终revision=2且只剩B，而不是revision=3和A+B。使用真实DPAPI封套和隔离文件，非源文本断言。
- 根因：atomic rename防止半文件，不解决read-modify-write竞争；进程内Promise队列不保护另一个实例/进程。

### 最小修复步骤与退出条件

1. 将共享检查点/索引的读改写交给现有Harness单写入边界，以SQLite事务与revision条件更新处理；保留DPAPI密文，不引入第二套状态真相源。[SQLite隔离说明](https://sqlite.org/isolation.html)支持写入序列化，但仍必须正确放置读改写事务。
2. 过期revision明确冲突，不覆盖，也不盲重放已派发业务；同时核对create/index路径，避免只修appendEvent。
3. 扩展为两个真实CLI/网页进程同session竞争及重启恢复：只能得到保留全部已提交更新，或一个明确冲突；不得两个成功却丢一笔。F04转绿，并保留既有防重派回归。

## Q5：成本、性能和业务成功是否都有真实依据？

### 已有防线与未测内容

现有评估回归会拒绝只有成功文本、缺工件、错误身份或错误银行目标的证据；P05驱动合同检查1/2/4并发、任务绑定、排队与执行时长、资金不变。它们本轮使用合成边界，不是7个真实Agent任务的性能结果。不能从毫秒级本地HTTP断言推导真实BYOK p95、准确率或节省比例。

### F05 / P2：声明的8192输出Token上限没有进入实际请求

- 来源：根AGENTS明确controller最多8192输出；`controller/src/runtime-adapters.mjs:136–159`创建ChatOpenAI时未设置输出Token上限。
- 实测：真实SDK发出的HTTP请求包含JSON模式，但`max_tokens`与`max_completion_tokens`都不存在。供应商可能有自己的默认值；这不等于项目已经执行了8192上限，也不证明本轮实际超支。
- 正例：已有格式证据记录usage，不会仅凭模型自称PASSED制造业务成功。

### 最小修复步骤与退出条件

1. 在唯一模型适配器明确设置已声明的输出上限，并通过[锁定SDK的实际HTTP请求](https://docs.langchain.com/oss/javascript/integrations/chat/openai)验证字段，不只断言modelFactory配置。
2. 保留finish_reason与usage，区分预算截断、格式不合法和业务失败；不为消除告警改成无限预算。
3. F05转绿后，再按当前正式清单记录真实任务成功率、人工介入率、p50/p95、排队/执行耗时和Token消耗；没有实际测量之前，不在面试或README写优化百分比。本轮不执行正式性能清单。

## 执行命令与证据

新增测试源码：[agent-interview-audit.test.mjs](../../../scripts/test/agent-interview-audit.test.mjs)。这是一套显式审计反例，当前预期退出1；不要将其重命名为“全部通过”或吞掉断言来获得绿色。原型编写时一次导出名错误已修正，不计为产品缺陷；下表是修正测试后的实际运行结果。

```powershell
# 仓库根目录；可以用 --test-name-pattern '^Q1' 到 '^Q5' 单独运行。
& .\platform\hengzhun-regression-system\runtime\node-v24.19.0-win-x64\node.exe --test scripts/test/agent-interview-audit.test.mjs

# 已有控制器、会话与安全回归，使用锁定Node24，测试只写临时根。
& .\platform\hengzhun-regression-system\runtime\node-v24.19.0-win-x64\node.exe --test platform/hengzhun-regression-system/controller/test/runtime-adapters.test.mjs platform/hengzhun-regression-system/controller/test/state-security.test.mjs platform/hengzhun-regression-system/controller/test/session-store.test.mjs

# 实际Harness/MCP/SQLite隔离接线，脚本使用锁定Node20 ABI。
.\scripts\test\verify-agent-workbench.ps1 -Scope Integration
```

| 范围 | 实测结果 | 原始回执 |
| --- | --- | --- |
| 新增Q1–Q5反例与正例 | 11项，6通过/5失败，exit1 | `agent/runs/interview-audit-20261105/counterexamples.tap` |
| Controller适配器、安全与会话回归 | 39通过/0失败，exit0 | 同目录`controller-regression.tap` |
| Workbench持久化/MCP/生产接线与runtime | 41＋2通过/0失败，exit0 | `verify-agent-workbench.ps1 -Scope Integration`本轮终端回执 |
| 业务证据断言、P05驱动合同、CLI结果归因 | 20通过/0失败，exit0 | 同目录`evaluation-regression.tap` |
| Harness正式报告/性能事实验证与发布客户端 | 32通过/0失败，exit0 | 同目录`release-regression.tap` |

既有回归合计134项通过；新增审计11项单列，不按绿灯数量抵消5个反例。其中发布测试在临时产品根与SQLite中构造证据，不向原Harness登记发布、不改变当前发布决策。原银行15容器复查仍运行。文档校验通过只说明文档结构，不说明上述缺口已修复。

不修改backlog完成状态，不推进整体GO。建议修复优先级：**F03凭据外发 → F01资金参数绑定 → F04检查点并发 → F02错误分类 → F05输出预算**。下一轮入口是这些已复现反例；生产修复完成后再运行所属回归和新身份的正式验收，不能续写旧身份为通过。
