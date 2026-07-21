---
id: DESIGN-HENGZHUN-I9-FLOWISE-PRODUCTIZATION-001
title: 衡准I9 Flowise正式产品化与便携交付规格
document_type: design
domain: regression-platform
status: accepted
authority: normative
version: 1.2
effective_date: 2026-07-21
owner: 傅钧烨
---

# 衡准I9 Flowise正式产品化与便携交付规格

> 本文是I9代码级辅助规格，只解释参数、目录、门禁和验收方法，不拥有项目实施顺序或任务状态。实施先后只看[`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md)，状态只看[`agent/backlog.yaml`](../../../agent/backlog.yaml)。

## 1. 目标与事实起点

I8已经完成Harness、SQLite、MCP、Worker、Builder、Playwright和可迁移Flowise制品，但当前没有正式Flowise产品运行时、监听端口、已发布Agentflow或真实MiMo主控对话。I9负责把这些经过验证的组件装配为Windows原生、免安装、可打开、可对话、可复制的产品。

I9不重新设计I8领域状态，不扩展任意代码生成，不把探针冒充产品，不用Flowise独有能力突破HiAgent边界。

## 2. 固定系统边界

```text
用户
→ Flowise 3.0.12 Agentflow（唯一自然语言入口）
→ 认证MCP（唯一平台外工具通道）
→ Harness / SQLite（领域事实与状态机）
→ Worker / Builder / Midscene / Playwright（受控本机执行）
→ 复兴银行（被测系统）
```

- Flowise负责会话、平台知识、结构化LLM、最小澄清、Human Input、条件、循环、MCP调用和回复。
- Harness负责鉴权、幂等、版本、任务、修复、证书、调度、证据元数据和审计。
- Worker负责固定运行时内的本机执行；正式回归只运行纯Playwright。
- MiMo是主控/视觉模型供应能力，不是领域状态权威。
- `.data/`是唯一运行态根目录，不入库、不进便携源代码清单。

## 3. 支持平台与依赖

- 操作系统：Windows 10/11 x64。
- Flowise：3.0.12，版本和依赖锁定。
- Node：产品自带20.20.2，不使用全局Node。
- 浏览器：产品自带Chromium revision 1217。
- 数据库：Flowise平台SQLite与Harness SQLite；职责分离。
- 禁止依赖：WSL、Docker、全局npm、运行时联网下载、系统级数据库服务。
- 密钥只从本机未跟踪配置或进程环境读取；归档只包含模板和变量名。

## 4. 产品目录增量

```text
platform/hengzhun-regression-system/
├── flowise/
│   ├── app/                  # 固定Flowise应用运行时
│   ├── artifacts/            # 可导入Agentflow、知识和连接清单
│   └── manifests/            # 版本、Hash和HiAgent映射
├── scripts/
│   ├── prepare-i9.ps1
│   ├── start-i9.ps1
│   ├── stop-i9.ps1
│   ├── status-i9.ps1
│   ├── export-i9.ps1
│   └── verify-i9*.ps1
├── tests/i9/
├── config/i9.example.env
└── .data/
    ├── flowise/              # Flowise SQLite、日志和平台运行态
    ├── sqlite/               # Harness权威SQLite
    ├── pids/                 # 受控进程记录
    └── artifacts/            # 脱敏运行证据
```

`probes/flowise/`只能作为来源证据；正式脚本、依赖或运行时不得引用该目录。

## 5. 九阶段详细门禁

### P1 产品化基线与运行时收编

- 记录I8基线提交、Flowise/Node/Chromium版本、依赖锁文件和目录Hash。
- 把Flowise及必需依赖复制到产品拥有的正式目录，验证入口文件可由自带Node解析。
- 在`D:\Agent\全局端口注册表.md`登记Flowise、Harness、MCP端口；启动前检测同协议占用。
- 配置Schema只允许回环监听、相对运行目录和变量引用，不保存秘密值。

退出：断网条件下可完成静态依赖检查；产品文件不引用`probes/`、WSL、Docker或全局Node。

状态（2026-07-21）：`VERIFIED_I9_P1`。正式运行时位于`flowise/app/`，由`flowise/runtime-package.json`、`flowise/runtime-package-lock.json`和`flowise/manifests/i9-p1-runtime-baseline.json`冻结；`npm.cmd run verify:i9:stage1`完成端口、Bundled Node入口、版本、锁文件和完整运行树Hash复核。该结论只关闭P1，不证明四服务已启动或Flowise已有可打开URL。

### P2 四服务便携启停与健康门禁

- 启动顺序：Harness → MCP → Worker → Flowise；停止顺序反向。
- 每个服务有独立健康检查、启动超时、PID归属和安全停止。
- 不终止未知占用进程；端口冲突时返回确定性错误。
- 重复启动必须幂等，部分失败必须清理本轮已启动进程。

退出：一键启动后四项健康，一键停止后只清理由本产品启动的进程；重启后SQLite完整。

状态（2026-07-21）：`VERIFIED_I9_P2`。产品自有生命周期入口、四项PID/健康检查、端口和弱Token失败关闭、幂等启动、部分失败清理、反序停止及双SQLite重启`quick_check`已由`verify:i9:stage2`和`verify:i9:stage2:live`通过。P3前不注册平台知识、模型或MCP连接。

### P3 平台SQLite、知识与配置导入

- Flowise平台数据库固定在`.data/flowise/database.sqlite`，不得与`regression_platform.sqlite`合并。
- 通过Flowise公开支持的界面、导入或正式API建立平台知识、模型连接和MCP连接；禁止直接写内部表。
- 知识制品包含来源、版本、内容Hash和引用ID；Harness只保存`KnowledgeSnapshotRef`。
- 备份和恢复分别覆盖两套SQLite，恢复后做完整性与职责边界检查。

退出：知识检索可返回固定引用；领域状态只存在Harness SQLite；平台资源重建不依赖开发RAG。

状态（2026-07-21）：`VERIFIED_I9_P3`。`flowise/i9/platform-resource-manifest-v1.json`冻结知识来源、版本、Hash、引用ID及确定性资源ID；`scripts/i9-platform-bootstrap.cjs`只经Flowise公开账户、导入、变量和知识查询API完成首次装配与幂等复核。migration 016与Harness公开受认证入口只登记不可变知识快照引用。`backup:i9`/`restore:i9`分别处理Flowise与Harness SQLite并检查Hash、`quick_check`、职责表和知识正文禁入。`verify:i9:stage3:live`已在隔离数据根完成真实公开API与双库恢复验证。模型/MCP这里只登记参数和秘密变量名，真实MiMo与十四工具调用仍由P4验收。

### P4 MiMo主控与14工具真实连通

- MiMo连接只引用环境变量，日志和错误响应不得回显密钥。
- 14项MCP工具逐项执行真实最小任务，验证Bearer、namespace、幂等和输出预算。
- 验证Human Input暂停/恢复、循环上限、工具超时和错误传播。
- 主控与视觉总窗口均为16K，输入最多12K、保留输出4K；MiMo的运行配置必须受 `qwen35-capability-envelope-v1.json` 限制。

退出：14项工具真实调用通过；无Code、HTTP、数据库、文件、Shell、浏览器或任意URL节点绕过MCP。

状态（2026-07-21）：`VERIFIED_I9_P4_QWEN35_CEILING_UPDATED`。Bundled Flowise `MCPToolkit`已对14项认证工具逐项执行最小成功任务，并覆盖幂等、输出预算、确定性超时和安全错误；Human Input、循环上限以及主控/视觉统一16K/12K/4K门禁均由配置与自动测试冻结。`scripts/verify-i9-stage4-mimo.cjs`使用Flowise自带`@langchain/openai`适配器及非思考、非流式`response_format=json_object`执行真实MiMo v2.5结构化请求；正式Workflow不使用模型原生工具调用，MCP只由平台节点调用。凭据只从忽略目录映射到进程，结束后清除且不输出。

#### P4.1 Qwen3.5兼容上限

- 报文固定为OpenAI兼容Chat Completions：只允许`system/user/assistant`和字符串`content`，只读取`choices[0].message.content`。
- 所有结构化提示必须明确写出JSON；模型输出经过本地Schema校验，最多三次总尝试，不能以自然语言修补后直接推进状态。
- 禁用thinking、streaming、原生tool calling、parallel tool calls、`reasoning_content`、developer role和多模态消息。
- MiMo支持但Qwen3.5未确认的能力一律不用；切换Qwen3.5时不得改变节点职责、MCP参数或Human Input门禁。

### P5 Agentflow正式导入、发布与恢复

- 把I8分段制品装配为一份正向主流程和一份反向续办流程，使用共享状态契约而非复制领域状态。
- 节点只允许：输入、知识检索、结构化LLM、条件、循环、Human Input、MCP、直接回复。
- 导出发布版本、节点清单、环境引用、Hash和HiAgent映射清单。
- 重启Flowise后用新会话和续办会话分别验证发布状态。

退出：用户能从正式Flowise URL打开已发布流程；重启后流程、知识引用和人工续办仍可用。

状态（2026-07-21）：`VERIFIED_I9_P5`。`p5-agentflow-publication-v1.json`冻结固定Flow ID、I8阶段2—7四份同源制品Hash、HiAgent能力交集、私有发布策略和公开API路径；`i9-agentflow-publish.cjs`只通过Flowise公开凭据、工作区导入、Chatflow更新、校验和工作区导出API完成装配，MiMo凭据经公开API加密保存。正式FlowData校验0问题，定义Hash与导出Hash写入忽略目录证据。`verify:i9:stage5:live`停止四服务并从相同隔离双SQLite重启后再次导出，Flow ID、发布状态和两类Hash一致。P6前不得把发布成功写成正向对话已通过。

### P6 正向自然语言全链路

- 输入只包含案例自然语言，不要求技术ID、Cron、凭据别名或提示工程指令。
- 覆盖案例结构化、澄清、确认、候选生成、固定Chromium 6/6、预览、激活、按需或调度选择及结果回复。
- 每次状态变化通过MCP回查Harness，不以Flowise记忆冒充事实。

退出：首个登录/资料一致性案例在真实Flowise对话中完整通过，证据脱敏且可追溯。

状态（2026-07-21）：`VERIFIED_I9_P6`。正式Agentflow以一句普通中文案例描述启动，依次经过知识查询、结构化、人工确认、MCP权威写入、确定性Builder、真实复兴银行门户浏览器事实探测、固定Chromium 2视口×3次签证、脚本预览、显式激活、独立按需运行确认、纯Playwright正式运行和终态回复；真实会话共执行20个节点并返回`FORWARD_FLOW_VERIFIED`。MiMo的IntentPlan交接改为平台原生支持的十项扁平结构化字段，由MCP重建严格领域对象，避免嵌套JSON转义漂移。P6不证明P7反向修复或P8/P9便携交付。

### P7 反向失败与限域恢复

- 用受控定位器变更制造正式失败，不修改Harness安全规则。
- Flowise只接收`StepFailureEnvelope`，按L1/L2/L3和三次上限生成白名单补丁。
- 新候选重新执行固定Chromium 6/6，用户独立决定激活、复跑和是否创建修复版调度。
- 旧调度不静默迁移；正式运行期间不调用LLM或Midscene。

退出：真实反向对话完成且无自动激活、无项目源码修改、无断言弱化、无秘密或绝对路径泄漏。

状态（2026-07-21）：`VERIFIED_I9_P7`。隔离门户仅把`LOGIN_USERNAME`定位方式从已验证`TEST_ID`切换到批准目录中的`LABEL`候选，原版本正式运行以`LOGIN_USERNAME_LOCATOR_NOT_FOUND + TEST_FAILURE`确定性失败。正式Agentflow随后只读取`CTX-L1 StepFailureEnvelope`，使用Harness返回的批准定位器生成新版本并完成桌面/窄屏各3次纯Playwright复验；真实会话执行37个节点并返回`REVERSE_FLOW_VERIFIED`。候选经独立人工激活和独立复跑确认后成功，修复版调度被用户明确拒绝为`REJECTED_NO_MIGRATION`，旧调度未静默迁移。P7不证明P8跨电脑便携、P9最终提交文件夹或HiAgent目标环境。

### P8 便携候选与跨电脑验收

- 从干净提交生成临时候选目录、配置模板、Hash清单、CycloneDX SBOM、两套SQLite备份说明和机器验收记录。
- 在当前电脑全新目录断网恢复；再在第二台Windows 10/11 x64电脑验证解压、配置、启动、正向最小回归、停止和重启。
- 候选扫描拒绝`.env`、Token、账号密码、运行数据库、日志、缓存、PID、Worker产物和未脱敏Artifact正文。
- 候选只用于便携性验收，不作为最终提交目录；验收失败必须回到对应阶段修复后重新生成。

退出：两台电脑证据均通过，源提交、候选Hash和运行版本一致。

### P9 最终可压缩提交文件夹

- 从P8已通过的冻结提交可复现地生成`platform/hengzhun-regression-system/.release/hengzhun-regression-system-windows-x64/`，不得复制P8运行后的可变目录冒充最终制品。
- 最终文件夹必须包含产品自带运行时、Flowise/Harness/MCP/Worker、默认空白数据目录结构、`README`、配置模板、启动/停止/状态入口、第三方许可证、CycloneDX SBOM、文件Hash清单和脱敏验收摘要。
- 最终文件夹不得包含开发源码和文档、`probes/`、`.git/`、`.env`、Token、账号密码、平台或Harness运行数据库、日志、缓存、PID、Worker产物、浏览器用户数据、未脱敏截图或Artifact正文。
- 生成过程必须使用明确内容白名单；压缩为ZIP后在全新临时目录解压，逐文件核对相对路径、大小和Hash，确认目录无需人工增删即可直接提交。
- `.release/`及生成的ZIP是交付制品，不进入Git；Git只保存生成脚本、清单Schema、配置模板和验收规则。
- P9通过后冻结最新Flowise版到`main`；`coze`保留，`hiagent`从冻结基线建立且不自动合并、删除或强制更新。

退出：最终文件夹与ZIP均通过内容白名单、秘密扫描、运行态扫描、绝对路径扫描、Hash往返校验和离线启动冒烟；源提交、目录清单、ZIP Hash和版本完全可追溯。

## 6. 验证层级

| 层级 | 必须验证 |
|---|---|
| Structure | 正式目录、依赖锁、无`probes/`运行引用、无敏感文件 |
| Process | 启停幂等、PID归属、端口冲突、部分失败清理、健康检查 |
| Platform | Flowise SQLite、知识、模型、MCP、Agentflow导入发布和重启恢复 |
| Contract | 14工具、鉴权、幂等、预算、超时、错误码、HiAgent节点映射 |
| Forward E2E | 一句自然语言到脚本、6/6、预览、激活、运行/调度和回复 |
| Reverse E2E | 失败、CTX、补丁、6/6、人工激活、复跑/修复版调度 |
| Portability | 干净目录、断网、第二电脑、备份恢复、Hash与SBOM |
| Submission folder | 可复现装配、内容白名单、秘密/运行态/绝对路径扫描、压缩往返Hash、离线启动冒烟 |

## 7. 状态声明规则

- P1—P4通过：只能称“Flowise运行底座可用”。
- P5通过：只能称“正式Agentflow已发布”。
- P6—P7通过：可称“本机Flowise自动化回归闭环可用”。
- P8通过：可称“Flowise版衡准已通过跨电脑便携验收”。
- P9通过：才可称“Flowise版衡准已形成可压缩提交文件夹”。
- 任何Flowise证据都不能称为“HiAgent已验收”。
