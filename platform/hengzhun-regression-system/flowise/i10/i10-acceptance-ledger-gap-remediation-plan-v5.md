# I10 验收账本缺口修复方案 v5

> **当前同步说明**：本文保留截至 2026-07-24 的验收快照和原始门禁结论。当前事实以实际代码、SQLite 状态和真实运行证据为准；完整链路目标以工作区《衡准-I10-完整链路审计文档》为准。本文中的30个工具、Agentflow v4和旧账本数字属于历史快照，重跑验收时必须按当前代码重新生成，不得直接当作当前配置。

> 当前同步要求：正式 Agentflow 使用 v5；当前 MCP 合同基线为33个工具；三次 Midscene 自动验证、可见浏览器接管和验证类型自动化评估仍是目标设计，尚未因本文历史快照而获得“已实现”结论。

## 1. 方案定位

本文仅依据当前桌面导出包及其运行账本制定：

```text
<发布包根目录>
```

权威运行账本：

```text
.data/evidence/i10/ledger-v3/ledger-run-summary.json
```

本文不把 `NOT_RUN` 自动判成产品缺陷。每个未验收场景必须先区分：

1. 验收器缺口：产品能力存在，但没有专用变体、夹具或断言；
2. Flowise 编排缺口：MCP 能力存在，但 Agentflow 没有连续可达路径；
3. 产品合同缺口：Harness、Worker 或 SQLite 缺少必需状态和原子操作；
4. 证据缺口：路径与实现均存在，只缺少真实连续运行证据。

## 2. 当前账本结论

截至 2026-07-24：

```text
总场景：72
PASS：13
FAIL：0
BLOCKED：0
NOT_RUN：59
已通过：F-001 至 F-013
下一基础场景：F-014
正式版判定：NO-GO
```

F-011 已有独立真实证据，证明视频低置信度草案可以经过人工纠错后继续完成真实 MiMo/Midscene 作者化、Builder、纯 Playwright、I10_2X2_V1、激活和即时执行。

当前 `NO-GO` 的原因不是前 12 条主链失效，而是：

- F-014 至 F-024 尚无独立连续验收结论；
- 48 条指定中断组合全部未运行；
- 30 个 MCP 工具的成功、Schema 失败、权限失败、版本冲突、幂等重放和 SQLite 前后状态矩阵尚未闭环；
- 最终 R-001 至 R-074 重判、Flowise 发布回读、Hash 清单和完整 `VERIFY` 尚不能执行。

## 3. 已关闭缺口：F-012 双来源冲突

### 3.0 当前结论

F-012 已于真实 Flowise 会话中通过并写入账本，出口为
`CANDIDATE_RETAINED`。证据绑定了两份输入 Hash、同一 journey、视频
ingest、图片 ingest、candidate、certificate 和 4 个唯一稳定性运行。
最终没有激活脚本、没有创建正式任务或调度。

首次真实验收暴露的根因不是 Flowise 按钮，而是视频事实合同丢失：

- Worker 将 MiMo 视觉观察写成步骤，却没有写入带视频帧来源的
  `caseFacts`；
- Harness 合并补充图片时因缺少视频事实，无法判定“客户资料”和
  “个人资料”的双来源冲突；
- 冲突视频的关键标签位于采样边界，真实抽帧没有稳定捕获该标签。

已完成的修复：

1. Worker 将真实 MiMo 的动作、目标和可见结果写入带
   `video:<ingest>:frame:<ordinal>:mimo` 来源的 `caseFacts`；
2. Harness 以已持久化视频事实与图片事实比较，并在纠正后继续保留
   两份来源供审计；
3. F-012 视频夹具保证每个采样关键帧都可见旧页面标签；
4. 增加单元测试，覆盖帧级来源、冲突门禁、无冲突路径和纠正后保留；
5. 真实重跑得到 `crossSourceConflict.observed=true`、
   `resolved=true`，并完成账本导入。

### 3.1 目标链

```text
视频＋补充图片
→ 两来源独立解析
→ 按语义字段检测冲突
→ 未裁决时禁止批准
→ 用户选择权威事实
→ 生成保留双来源溯源的新草案
→ 批准
→ Midscene
→ Builder
→ 纯 Playwright
→ I10_2X2_V1
→ reject 不挂载
→ 候选、证书和源码保留
```

### 3.2 当前实现事实

- `uploadFor` 已支持主视频和补充图片同时上传；
- 图片入口已支持 OCR、视觉事实和逐事实人工决定；
- 视频入口已支持 MP4/H.264、FFmpeg、OCR、MiMo 和草案纠错；
- `enrichDraftWithImageFacts` 可以把已确认图片事实加入视频或文件草案；
- F-003、F-005、F-008 已证明候选可在拒绝激活后保留。

### 3.3 真实根因

当前 `enrichDraftWithImageFacts` 只执行事实合并，没有执行跨来源语义冲突检测。图片事实会被附加到视频草案，但系统不会：

- 判断同一业务字段的两个值互相冲突；
- 在冲突未裁决时加入不可批准缺口；
- 保存用户采用哪一来源的显式决定；
- 证明最终草案同时保留视频帧与图片事实溯源。

执行矩阵、Stage8 运行器和账本导入器现已注册 F-012 专用变体。

### 3.4 代码级修复

1. 在 `harness/src/i10/service.ts` 增加确定性跨来源冲突检测器。
2. 冲突按规范化业务字段比较，不使用“后上传覆盖前上传”。
3. 冲突未裁决时：
   - 在 `caseFacts` 中保留两个候选值和各自 `provenanceRefs`；
   - 在 `missingFields` 中加入稳定的冲突缺口码；
   - `confirmationStatus` 保持 `WAITING_USER`；
   - 禁止进入最终草案批准节点。
4. 用户纠错后：
   - 保存采用的事实、决策版本和理由；
   - 不删除另一来源的审计记录；
   - 重新生成冻结草案和载荷 Hash。
5. 在 `scripts/i10-stage8-orchestrator.cjs` 增加固定冲突夹具：
   - 视频事实：“客户资料”；
   - 图片事实：“个人资料”。
6. 在 `scripts/i10-stage8-live.cjs` 增加
   `F012_VIDEO_IMAGE_CONFLICT_RETAIN`：
   - 驱动冲突纠错；
   - 批准修订草案；
   - 在激活门槛执行 `reject`；
   - 断言没有 run/schedule。
7. 在 `acceptance-ledger-execution-matrix-v1.json` 增加 F-012 绑定，期望出口为 `CANDIDATE_RETAINED`。
8. 在 `scripts/i10-ledger-runner.cjs` 增加联合断言：
   - 视频与图片两个输入 Hash；
   - 两来源 MCP 调用；
   - 冲突未裁决时未调用 `case_prepare`；
   - 冲突决定及修订版本存在；
   - 最终草案具有双来源溯源；
   - candidate、certificate、script 存在；
   - activeVersion 不变；
   - task、run、schedule 均未创建。

### 3.5 F-012 退出门槛

只有真实 Flowise 会话完成整条链、账本导入为 `PASS`，且证据能精确绑定本次 chatId、journeyId、ingestId、imageIngestId、candidateId 和 certificateId，才进入 F-013。

## 4. F-013 与 F-014

### 4.1 F-013：Midscene 失败后同案例重试

已完成并导入账本。首次作者化任务以
`I10_MIDSCENE_MODEL_TIMEOUT`失败关闭，旧失败任务保留；同一case重新提交后
生成新的build job，完成真实Midscene、Builder、纯Playwright和2×2验证，
最终用户拒绝挂载，出口为`CANDIDATE_RETAINED`。

修复：

- 增加一次性、可审计的视觉超时或定位失败注入；
- 第一次失败不得生成 ActionTrace、证书或激活版本；
- Flowise 只展示“重新作者化同一案例”的唯一提案；
- 恢复条件后使用原 `caseId` 和新幂等键创建新 authoring task；
- 旧失败 task 保留；
- 新 task 重新执行 Midscene、Builder、纯 Playwright 和 2×2；
- 最终 `reject` 不挂载，候选保留。

若当前合同不能引用原 `caseId`，应补最小化恢复接口，不得通过新建无关案例冒充恢复。

### 4.2 F-014：转账首次确认后的U盾验证同任务恢复

该P0项已完成真实连续验收。真实业务顺序固定为：

```text
登录
→进入转账
→填写收款信息、金额和用途
→第一次确认业务信息
→页面弹出U盾验证
→Midscene临场识别并暂停
→用户在已持久化U盾设备或安全窗口直接确认
→原浏览器进入单号查询页面
→Midscene继续核对单号和受理状态
```

不得把U盾放在登录后，不得用Mock、预先跳过验证或新建任务替代同任务恢复。
已有一次“登录后U盾”技术运行只证明两级状态机可达，因业务位置错误不得导入
F-014账本。

修复：

- 将固定登录/个人资料候选模板扩展为受控的
  `TRANSFER_UKEY_ORDER_QUERY`执行档案，包含转账输入、第一次确认、验证后单号查询断言；
- 业务文本输入必须来自冻结CaseDraft的非秘密输入事实，账号密码仍只来自
  `credentialRef`；
- Midscene必须在第一次确认后根据当前页面文字临场发现U盾门槛，不能由预设步骤
  直接伪造“已发现”；
- Worker 进入 `AWAITING_RUNTIME_VERIFICATION` 并返回 `verificationId`、
  原taskId、暂停动作序号和浏览器会话标识；
- Agent 明确提示用户只在U盾设备或安全窗口完成确认；
- 第一次 `proceed` 只提交 `USER_READY`；
- 第二次 `proceed` 只提交 `USER_ACTION_COMPLETED`；
- 恢复原 taskId/runId和原浏览器上下文，禁止新建任务或重复第一次确认；
- 恢复后必须进入单号查询页面并核对转账单号、受理状态；
- `reject` 安全取消；
- 重复、过期、跨版本或跨用户决定失败关闭；
- 不保存验证码、PIN、U 盾口令等秘密；
- 作者化完成后仍需Builder、纯Playwright和2×2验证；
- 正式立即执行再次遇到U盾时必须使用相同两级暂停恢复机制，不能只在作者化阶段通过；
- 不由Midscene输入PIN或绕过U盾；“操作U盾”在本项目中仅指识别门槛、暂停、
  等待用户对持久化设备直接确认并在页面通过后继续。

完成证据：

- Builder已支持`TRANSFER_UKEY_ORDER_QUERY`并保留冻结CaseDraft中的非秘密业务值；
- Harness与Midscene Worker视觉目标已覆盖转账表单、第一次确认、U盾验证和单号查询；
- 作者化与正式Playwright执行均能在第一次确认后临场识别U盾门槛，等待
  `USER_READY`与`USER_ACTION_COMPLETED`，并在原任务、原浏览器上下文恢复；
- 受控夹具已提供转账表单、第一次确认、U盾验证和单号查询页面；
- 2026-07-24真实运行产生两个独立`verificationId`，作者化和正式执行各完成一次
  暂停恢复；2×2稳定性验证通过，最终任务`PASSED`；
- F-014已作为`REAL_EVIDENCE_COMPLETE / PASS`导入72项验收账本。

历史“登录后U盾”运行仍不得作为证据；本次通过不放宽后续场景的真实连续验收门槛。

## 5. F-015 至 F-024

### 5.1 候选、等待、恢复和下载

| 场景 | 当前判断 | 修复与验收 |
|---|---|---|
| F-015 | 失败关闭合同存在，专用重验链未跑 | 注入纯 Playwright 或 2×2 失败；不得签证；修订后重新执行全部四次验证 |
| F-016 | 异步轮询存在，45 秒以上同任务证据不足 | 使用可控延迟；反复查询同一 task/candidate；禁止重复提交 |
| F-017 | candidate 恢复基础存在，跨会话挂载未跑 | 新 chatId 恢复同 candidate；按精确版本和 Hash 激活 |
| F-022 | task/result 查询存在 | 未就绪时保留同一 taskId；就绪后只为该结果生成下载授权 |
| F-023 | 短时授权和 Hash 基础存在 | 验证授权过期、重新授权、Hash 不一致失败关闭以及执行/证书/下载 Hash 一致 |

### 5.2 调度与反向修复

| 场景 | 修复与验收 |
|---|---|
| F-018 | 歧义时间只能留在输入阶段；重填后展示唯一规范化计划；二次确认后才创建调度 |
| F-019 | 制造正式运行失败；用户拒绝修复；原脚本、激活版本和调度状态不变 |
| F-020 | 失败分类→限域修复候选→Builder→纯 Playwright→2×2→激活→即时复跑通过 |
| F-021 | 周期任务失败修复；旧计划不静默换 Hash；用户显式确认后创建新周期计划 |
| F-024 | 查询唯一调度→精确确认→停用；服务重启后仍保持停用 |

时间相关测试必须使用可控 Clock，覆盖未来/过去时间、IANA 时区、DST、misfire、重复提交和重启恢复，不能通过真实长时间等待完成。

## 6. 48 条中断组合

只有 F-001 至 F-024 全部得到稳定结论后，才执行 48 条指定组合。

每条组合必须独立记录：

```text
scenarioId
faultId
故障注入点
原操作是否已提交
lastStableState
journeyId/taskId/scheduleId
恢复命令或恢复交互
重复副作用检查
最终出口
```

判定规则：

- `PASS`：恢复后到达预期稳定出口，且无重复副作用；
- `FAIL`：发现真实产品或验收器缺陷；
- `BLOCKED`：仅限不可控外部条件，并必须记录 externalBlocker、lastStableState 和 recoveryCommand；
- 尚未执行必须保持 `NOT_RUN`，不得改写为 `BLOCKED`。

## 7. 30 工具与安全矩阵

对运行时公开的 30 个 MCP 工具逐项验证：

1. 合法成功；
2. Schema 失败；
3. 权限失败；
4. 版本冲突；
5. 幂等重放；
6. SQLite 操作前后状态。

每条结果必须与工具名、请求结构 Hash、状态码、错误码和数据库状态绑定。不得保存 Bearer、API Key、用户名、密码、验证码、PIN 或完整敏感请求体。

使用专用假秘密扫描：

- Flowise 会话与数据库；
- Harness/Worker 日志；
- SQLite 业务表；
- 图片、视频帧、OCR、ActionTrace；
- Playwright 源码与下载制品；
- 验收证据和恢复账本。

## 8. 实施顺序

### S1：F-012（已完成）

- 完成冲突检测合同和单元测试；
- 增加冲突夹具、Stage8 变体和账本断言；
- 构建 Harness/Worker；
- 必要时重建并发布 Agentflow v4；
- 真实执行 F-012 并导入账本。

退出结果：F-012 为 `PASS`；账本证据状态为 `REAL_EVIDENCE_COMPLETE`。

### S2：F-013/F-014

- F-013已完成并导入；
- 扩展转账/U盾/单号查询执行档案和受控夹具；
- 让作者化Worker和正式Playwright Worker都能保持同一浏览器、同一任务两阶段恢复；
- 增加“第一次确认不得重复”“验证后进入单号查询”的断言；
- 真实执行F-014，只有作者化和正式运行两次验证链均通过后导入。

### S3：F-015/F-016/F-017/F-022/F-023

- 先完成确定性异常、延迟和授权过期测试；
- 再执行连续 Flowise 旅程；
- 每条使用独立终态和独立证据。

### S4：F-018/F-019/F-020/F-021/F-024

- 接入统一可控 Clock；
- 完成调度修订、拒绝修复、修复复跑、新调度和停用持久化；
- 分别实跑并导入。

### S5：48 条中断与 30 工具矩阵

- 先运行工具合同和安全矩阵；
- 再按指定组合执行 48 条中断验收；
- 修复发现的真实缺陷后只重跑受影响场景，不复用旧成功证据。

### S6：权威链收口

只有 72 条场景全部不再是 `NOT_RUN` 后执行：

1. 重判 R-001 至 R-074；
2. 生成最终机器可读账本；
3. 重建 Agentflow v4；
4. 使用 Flowise 公共 API 发布并回读 flowId、版本、内容 Hash 和 `deployed=true`；
5. 更新最终文件 Hash 清单；
6. 执行 `VERIFY.cmd --no-pause`。

## 9. 每条场景的证据合同

每条场景必须独立保存：

- flowId、flowVersion、flowHash；
- chatId、journeyId；
- 输入附件 SHA-256；
- MCP 调用序列；
- preparation/case/ingest/image/candidate/certificate/script/task/run/schedule/inbox/artifact 引用；
- 状态迁移；
- 四次稳定性 runId（适用时）；
- 用户选择、冻结载荷 Hash 和最终出口；
- acceptanceStatus；
- 失败时的 defectId、lastStableState 和 recoveryEntry。

结果入箱必须按本场景 taskId/runId/scheduleId 精确绑定，禁止扫描到历史成功结果后误判本次通过。

## 10. 最终 GO 门槛

只有同时满足以下条件，I10 才能由 `NO-GO` 改为 `GO`：

- F-001 至 F-024 全部具有独立连续运行结论；
- 48 条中断组合全部具有恢复或安全关闭证据；
- 账本无 `NOT_RUN`；
- 无未解释 `FAIL`；
- 无用来替代未执行的 `BLOCKED`；
- MiMo/Midscene 为真实、非 Mock、非 degraded；
- 三入口、图片和视频形成统一、可溯源 CaseDraft；
- 人工验证恢复同一 taskId；
- 候选、证书、执行和下载 Hash 一致；
- ON_DEMAND、ONE_TIME、RECURRING 和停用均有真实终态；
- 反向修复重新通过 Builder、纯 Playwright 和 I10_2X2_V1；
- MCP 合同数、运行时数、Flowise 引用数和真实矩阵证据数均为 30；
- 安全扫描通过；
- Flowise 公共 API 回读一致且 `deployed=true`；
- `VERIFY.cmd --no-pause` 返回 `I10_PORTABLE_FOLDER_VERIFIED`。
