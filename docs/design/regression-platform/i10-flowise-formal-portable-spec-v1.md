---
id: DESIGN-HENGZHUN-I10-FORMAL-PORTABLE-001
title: 衡准I10 Flowise正式版统一输入、真实作者化与Windows便携交付规格
document_type: design
domain: regression-platform
status: active
authority: supporting
version: 1.6
effective_date: 2026-07-24
owner: 傅钧烨
---

# 衡准I10 Flowise正式版统一输入、真实作者化与Windows便携交付规格

> 本文只拥有I10参数、对象、状态机、接口、代码边界与验收方法。项目实施先后只看[`agent/plans/active/v54-implementation-batches.md`](../../../agent/plans/active/v54-implementation-batches.md)，任务状态只看[`agent/backlog.yaml`](../../../agent/backlog.yaml)。I9发布目录、migration 001—016、六次证书和证据均为不可覆盖历史基线。

> HiAgent 2.5.1 兼容边界：Flowise 的 `humanInputAgentflow`、`Proceed`、`Reject` 和暂停检查点仅是本机交互适配器。跨平台同源合同必须使用消息、信息收集、选择器/条件和状态回流；HiAgent 是否支持具体节点、插件、Skill、视觉能力和网络路径，统一以 [`HiAgent/Flowise 能力边界基线`](../../architecture/overview/hiagent-flowise-capability-boundary-v1.md) 及目标租户复验为准。

## 1. 缺口与DecisionDelta

| 编号 | 正式关闭条件 |
|---|---|
| `I10-G01` | XLSX、CSV、DOCX、JSON经受控附件、预览、批量错误和人工确认形成统一CaseDraft。 |
| `I10-G02` | MP4/H.264经校验、FFmpeg、本机PP-OCRv5、脱敏关键帧、确定性文字变化时间线、主控事实筛选和逐项校正形成统一CaseDraft。 |
| `I10-G03` | 明文只进入本机表单，DPAPI CurrentUser密文写入`.data`，其他报文只含`credentialRef`。 |
| `I10-G04` | 门户登录候选由MiMo/Midscene真实视觉定位并由Playwright独立执行验证。 |
| `I10-G05` | ActionTrace与Playwright事实进入有限DSL及确定性Builder，模型不直接提交最终源码。 |
| `I10-G06` | 新候选和修复候选执行`I10_2X2_V1`四个唯一运行；I9六次证书保持历史可读。 |
| `I10-G07` | 交付完整`.cjs`、版本、Hash和短时下载地址，下载Hash等于执行Hash。 |
| `I10-G08` | 正向对话支持自然语言即时、单次和周期执行草案及人工确认。 |
| `I10-G09` | 正式I10制品与任务不存在固定2030计划。 |
| `I10-G10` | 主控以通用`CONTROL_*`变量接入DeepSeek V4 Flash能力档，1M总上下文、8192输出。 |
| `I10-G11` | 视觉以通用`VISION_*`变量接入MiMo v2.5，严格16K/12K/4K及Qwen3.5消息边界。 |
| `I10-G12` | 三入口分别通过即时、单次、周期、失败、修复、复验和对话回执真实验收。 |
| `I10-G13` | 自然语言、案例文件、视频三种主输入都可附带0—20张补充图片；图片不是第四种主输入。 |
| `I10-G14` | 补充图片在本机执行固定版本的中英文ONNX OCR、敏感框脱敏和Hash绑定；原始未脱敏图片不进入主控模型，MiMo不参与附件识别。 |
| `I10-G15` | 主控模型只从脱敏OCR证据选择案例事实，保存字段、来源、置信度和人工确认要求；未知值不得猜测。 |
| `I10-G16` | `ActionStepV2`显式保存文本框输入值、值来源和证据引用；凭据只用`credentialRef`，验证码/PIN只允许运行时人工输入。 |
| `I10-G17` | 案例显式记录短信、TOTP、验证码、扫码、U盾、移动证书、生物识别和人工审批要求。 |
| `I10-G18` | Midscene发现验证后暂停并向Harness报告；用户准备并完成验证后才恢复当前浏览器会话。 |
| `I10-G19` | U盾只支持浏览器侧发现、协调、等待和恢复；私钥、PIN、物理按键及安全桌面永远由用户和设备控制。 |
| `I10-G20` | 无人值守回归遇人工验证必须返回`HUMAN_IN_LOOP_REQUIRED`；不得把阻塞、Playwright结果或模拟验证冒充成功。 |

成果汇报中“账号密码贯穿所有报文”的旧表述被安全DecisionDelta覆盖：凭据不进入Flowise、模型、普通SQLite表、脚本、日志、截图、证据、发布包或Git。发布包复制后必须重新录入。I9的2视口×3次规则只认证I9历史候选；I10新候选固定2视口×2次。

## 2. 通用运行环境模型配置

正式发布接口不得使用厂商名环境变量：

- 主控：`CONTROL_API_KEY`、`CONTROL_BASE_URL`、`CONTROL_MODEL_NAME`。
- 视觉：`VISION_API_KEY`、`VISION_BASE_URL`、`VISION_MODEL_NAME`、`VISION_MODEL_FAMILY`。
- 内部：`HENGZHUN_MCP_TOKEN`、`HENGZHUN_WORKER_TOKEN`。

当前配置值分别选择DeepSeek V4 Flash与MiMo v2.5，但变量和启动脚本保持通用。Midscene 1.10.5需要的旧变量只允许由启动脚本在当前进程生成兼容别名。两模型都必须经过真实结构化输出/真实截图探针；未配置或调用失败时不得Mock、降级或以Playwright冒充视觉成功。

未来内网Qwen3.5不是仅替换模型名即可宣称兼容。精确checkpoint、推理后端和HiAgent连接器必须按[`flowise/i10/intranet-qwen35-capability-gate-v1.json`](../../../platform/hengzhun-regression-system/flowise/i10/intranet-qwen35-capability-gate-v1.json)执行实时门禁：主控至少1,000,000总上下文和8,192最大输出，视觉至少16,000总上下文、12,000输入和4,000输出保留，并分别通过JSON与截图探针。低于最低档时阻止迁移，不得静默降级；高于最低档时记录端点声明能力，适配器不得静默限缩。Workflow仍只传最小依赖锥，端点容量不扩大数据访问授权。

## 3. 信任与数据边界

`InputEnvelope`只接受`NATURAL_LANGUAGE / CASE_FILE / VIDEO`。文件和视频只接受Flowise受控附件ID与文件名，Harness把路径限制在配置的附件根；不提供任意路径、文件系统、Shell、SQLite或浏览器工具。确认前CaseDraft允许信息缺口，确认时必须有目标系统、入口、步骤、断言、可信来源和零缺口。

凭据状态为`AWAITING_INPUT -> READY -> EXPIRED/REVOKED`。捕获令牌仅位于URL fragment并在页面加载后从地址栏清除；SQLite只保存引用、密文相对路径、密文Hash和DPAPI范围。Worker通过只允许回环地址和Worker Bearer的内部端点按执行临时解析，使用后清空内存引用，不输出内容。

导入状态为`PROCESSING -> WAITING_USER -> CONFIRMED/REJECTED/FAILED`。原始导入项不可变；修正形成递增revision。案例文件必须返回源字段到CaseDraft字段的映射预览；混合批次按原始ordinal隔离无效记录并返回脱敏错误码和记录Hash，不保存原始坏记录。存在未解决批量错误时禁止确认；用户按原ordinal提交完整CaseDraft后形成不可变错误解决记录并重新复核。宏、旧XLS、异常压缩、越界路径、超限、无H.264、超1080p/15分钟/500MiB、视频OCR失败、主控事实筛选失败和Hash不一致均失败关闭。

## 4. MCP、SQLite和Worker

I9十四项工具向后兼容，I10原有五项受控入口保持不变，并新增`image_ingest_submit/get`、`verification_get`、`verification_decision_submit`，合计二十三项。migration 017增加凭据会话/引用、导入任务/项目/revision、视频帧、ActionTrace和版本化稳定性绑定；migration 019增加不可变字段映射、逐记录错误与人工解决记录；migration 020增加图片任务、不可变脱敏OCR证据、事实候选、验证挑战和不可变验证事件。Flowise SQLite只保存平台账户、Workflow、变量引用和平台知识；Harness SQLite是回归领域唯一事实源。

### 补充图片与验证状态机

三类主输入均接受`supportingImages[]`。Harness只接受Flowise受控附件引用，单图不超过20MiB、总量不超过100MiB，仅允许PNG/JPEG/WebP并校验文件魔数。Worker在本机以`chi_sim+eng`执行OCR，在传给主控模型前遮挡敏感区域并截断脱敏文本；主控仅返回`CaseFactCandidate[]`，Harness再确定性生成或规范化`ActionStepV2`。图片事实最终仍需用户在案例确认门禁中确认。

#### 2026-07-24 图片识别质量DecisionDelta（纯OCR最终决策）

本节取代此前提出但未作为最终方案保留的“ONNX OCR与MiMo并行识别”设计。补充图片识别只允许“本机ONNX OCR → 主控模型筛选案例事实”，不得继续增加视觉模型与主控模型之间的证据合并耦合：

1. Worker在校验文件魔数和源Hash后，只调用发布包内固定版本的PP-OCRv5 mobile ONNX中英文模型。正式引擎标识、检测/识别模型Hash、识别区域数量和耗时必须进入证据；OCR失败时任务失败关闭，不调用MiMo兜底。
2. 主控模型只接收脱敏后的OCR文本块、置信度、框坐标和来源Hash，负责选择与案例有关的字段、动作、预期结果和验证要求。主控不得接收原图、恢复未知文字、覆盖证据来源或把低置信度结果提升为确定事实。
3. MiMo仅服务Midscene浏览器视觉作者化与定位恢复，不参与图片附件或OCR结果分析。图片附件链和Midscene作者化链在数据合同、运行记录和失败语义上完全隔离。
4. 图片任务状态固定为`RECEIVED -> OCR_ANALYZING -> CONTROLLER_FILTERING -> WAITING_USER_REVIEW -> CONFIRMED -> IMAGE_PURGED`；失败进入`FAILED`。用户拒绝或要求纠正时保持`WAITING_USER_REVIEW`，不得提前删除图片。
5. Flowise不得直接打印OCR全文或事实原始JSON。人类交付固定为“状态简报 + 15分钟脱敏图片临时预览 + 图片分析报告.md + 图片分析结果.json + 当前唯一操作”。对话只显示OCR引擎、识别区域数、主控筛选事实和待确认项。
6. 用户确认全部事实后，Harness先持久化事实决定、图片Hash、OCR模型Hash、主控调用证据、报告Hash和删除清单，再删除本任务的原图副本、识别中间图、预览图及对应受控上传图片。删除成功后状态为`IMAGE_PURGED`；删除不完整时返回`I10_IMAGE_PURGE_INCOMPLETE`，不得宣称图片已清除。
7. 删除后仅保留结构化事实、来源Hash、OCR引擎及模型Hash、主控调用证据、报告制品和删除收据；不得保留可还原图片内容的Base64、缩略图或OCR缓存。未完成用户确认的遗留图片由本机清理任务在72小时后失败关闭并清除。
8. 正式门禁至少使用中文银行页面夹具验证标题、字段名、按钮和状态文字的可读命中率。`tesseract.js`不再属于图片或视频正式识别链，也不得作为ONNX失败后的后备。

验证挑战状态固定为`DETECTED → WAITING_USER_PREPARATION → USER_READY → VERIFICATION_CONFIRMED → RESUMED`；取消、过期、设备/中间件不可用、权限拒绝、会话丢失、验证失败和锁定风险均为失败终态。Midscene作者化可在同一浏览器会话中等待用户确认后继续；纯Playwright即时/定时/周期执行发现人工验证时失败关闭并产生`HUMAN_IN_LOOP_REQUIRED`，由用户处理后重新执行。验证码、动态口令、U盾PIN、私钥、生物特征不进入模型、SQLite、日志、截图、脚本或证据。

#### 2026-07-24 视频识别纯OCR迁移DecisionDelta

视频Worker使用随包FFmpeg最多选择12个关键帧，并复用图片入口同一套固定版本PP-OCRv5 mobile ONNX模型。每帧保存OCR文本Hash、模型聚合Hash、识别区域数、脱敏关键帧Hash和时间戳；原始帧处理后删除。Worker以`OCR_FRAME_DIFF_V1`确定性比较相邻帧文字集合，只能表述“页面文字出现、消失或保持”，不得声称看见点击、鼠标位置、窗口数量或未被OCR证明的动作。

全部OCR时间线一次性交给主控模型整理候选步骤、预期结果和案例事实。主控仅接收OCR文字、时间戳、置信度和来源引用，不接收关键帧图片；所有视频推导事实置信度上限为0.74并固定`requiresUserConfirmation=true`。用户逐项确认前不得形成正式案例。OCR为空、ONNX证据缺失、主控返回空步骤/空事实、来源引用越界或Hash不一致均失败关闭。MiMo不参与视频导入，仍仅用于后续Midscene浏览器作者化与定位恢复。

I10候选构建先由Harness发放CTX-L2上中下文Envelope，Worker通过同一`buildMidscenePrompt`构造提示并由Midscene对受控语义目标做真实`aiLocate`，Playwright核验落点唯一性后才使用内存凭据执行。Harness必须重算Envelope Hash与Prompt Hash，二者任一不一致都不得写ActionTrace或候选。每个事实记录动作、页面签名Hash、事实Hash和四类Playwright验证；ActionTrace不可删除。Builder只接受批准的语义目标并生成确定性源码。

## 5. 验证、交付、调度和修复

`I10_2X2_V1`为1440×900和390×844各2次、全新BrowserContext和独立Fixture；4次全通过才签证。任意失败阻止签证。I9对象通过稳定性绑定保持`I8_2X3_V1/6`。

候选预览必须使用`includeDownload=true`；对话只显示摘要、版本、SHA-256和短时URL，完整源码以5分钟一次性授权作为`.cjs`下载。服务在发放和消费授权时重新验证候选包与证书绑定；下载内容SHA-256、响应Header、预览Hash、执行Hash和证书Hash必须一致，令牌消费后不可重放。修复稳定性领取必须显式返回策略版本和必需运行数，并逐项核对视口、序号与Fixture身份。激活绑定精确Hash和版本。

主控从自然语言时间生成`ON_DEMAND / ONE_TIME / RECURRING`草案；Harness确定性校验IANA时区、`runAt`或Cron、misfire和重试。提交前必须人工确认，正式调度不调用模型或Midscene。夏令时固定为：春季不存在的本地时刻顺延到下一有效日期，秋季回拨产生的重复本地分钟只执行一次。自然语言还可进入`RESULT_QUERY`或`SCHEDULE_DISABLE`管理意图；查询只读正式结果收件箱，停用必须展示scheduleId并再次人工确认，二者仍通过现有19个MCP工具。项目固定示例不得变成真实计划。

失败修复只接收最小StepFailureEnvelope；主控只能提出当前候选脚本的白名单补丁，不能修改项目源码或弱化断言。新修复版本重新执行纯Playwright与同一四次门禁，用户独立确认激活、复跑和是否另建调度，旧调度不自动迁移。

## 6. 发布与证据门禁

2026-07-24最新发布决策覆盖原ZIP要求：I10不再重新导出目录或生成压缩包，只对当前桌面运行权威目录维护`manifest/files.sha256.json`并执行完整VERIFY。清单必须覆盖核心文件和大型运行时资产树，VERIFY必须复算文件Hash、资产聚合Hash、清单自身SHA-256、禁止内容和执行前后文件集合；密钥、凭据、运行库、日志、历史证据、缓存、PID和机器绝对路径仍不得进入受保护清单范围。该本机目录验证不得表述为跨电脑便携认证。

I10的交付边界是回归测试平台本身，不建立第二台办公电脑的专用验收角色、机器记录或完成门槛。Windows 10/11 x64支持主张由可重复的平台合同证明：发布物自带运行依赖，不要求Node/WSL/Docker或全局安装；路径解析不得依赖源机器绝对路径；生命周期入口必须支持含空格或中文的可写目录；秘密、凭据、运行数据库、日志和缓存不得进入发布物；准备、启动、状态、停止、SQLite迁移和Chromium执行必须在当前受支持环境通过。未来在其他电脑上的实际使用属于普通部署验证，不扩张I10实现范围，也不替代上述平台合同。HiAgent迁移仍是后续独立阶段。

## 7. 当前实施状态（2026-07-24）

I10-S0—S9及R0—R7已按当前本机交付边界完成：真实双模型与Flowise公开发布通过，原三入口9条正向和3条反向场景全部完成。补充图片链以真实本机PP-OCRv5和真实主控模型形成可读事实、临时预览、确认删除与72小时清理闭环；视频历史链已迁移为FFmpeg、同一PP-OCRv5、`OCR_FRAME_DIFF_V1`和一次主控事实筛选，不再调用MiMo，真实运行探针返回`I10_LIVE_VIDEO_OCR_ONLY_PASSED`。MiMo仅保留给后续Midscene作者化。`flowise/i10/gap-closure-matrix-v1.json`和`npm run verify:i10:closure`把`I10-G01...I10-G20`逐项绑定到实现、测试、S8证据和R7证据，防止仅凭文档关闭缺陷。U盾探针只证明平台暂停/恢复与安全边界，明确`hardwareOperationVerified=false`。S9未重新导出或生成ZIP，只刷新现有桌面目录的VERIFY清单；清单覆盖213个核心文件和6个运行时资产，SHA-256为`282ca17c8775f675071b0287ef2793caa7dcb70f6ba098d3199c14c84281db07`，完整校验返回`I10_PORTABLE_FOLDER_VERIFIED`且禁止内容命中0项。未来Qwen3.5门禁当前为`LIVE_ENDPOINT_UNVERIFIED`，它属于精确内网端点迁移证据，不能由现有MiMo运行证据代替。
