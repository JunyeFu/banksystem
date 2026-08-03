# 衡准 I10 验收账本缺口修复方案 v4

## 1. 方案定位

本文依据桌面导出包当前代码、当前 Flowise Agentflow v4、Harness/Worker/SQLite 合同和验收账本实时状态编制，作为 F-011 之后的修复与验收执行方案。

当前运行权威仅为：

`<发布包根目录>`

本文取代 v3 中已经过期的数量、下一场景和“文件/视频均未证明”等状态判断，但不删除 v1—v3 历史文件，也不改变 I9 历史证书。

固定边界：

- 不重新导出目录，不生成 ZIP。
- 不提前更新最终 Hash 清单；Hash 只在 S7 收口。
- 不读取、输出或持久化模型密钥、账号密码、验证码、PIN。
- Playwright 成功不能替代 MiMo/Midscene 成功证据。
- `NOT_RUN` 只表示尚未实跑，不等于产品未实现。
- 只有真实连续运行、SQLite 权威状态、制品 Hash 和用户可见终态一致，场景才能记为 `PASS`。

## 2. 当前账本事实

截至本次审计：

```text
总场景：72
PASS：10
FAIL：0
BLOCKED：0
NOT_RUN：62
下一场景：F-011
```

已经真实通过：

```text
F-001 至 F-010
```

已证明的能力包括：

- 自然语言、单图、多图、纯图片、文件、文件加图片和视频入口；
- 本机 DPAPI 凭据引用；
- Flowise 精确确认与同旅程修订；
- 真实 MiMo v2.5/Midscene 作者化；
- 确定性 Builder、纯 Playwright、I10_2X2_V1；
- 候选挂载、不挂载；
- ON_DEMAND、ONE_TIME、RECURRING；
- 结果入箱；
- 视频 MP4/H.264、FFmpeg、OCR、MiMo 分析；
- 视频草案缺少目标系统和入口地址时拒绝、修订、再批准；
- 异步视频导入跨轮继续。

F-010 当前权威证据：

```text
场景：F010_VIDEO_ONE_TIME
结果：PASS
执行方式：ONE_TIME
candidateId：candidate_bb803b9e90170a10282692061440da3921be4045
certificateId：certificate_ed44a2c44b5acadfcf7ce1e694dd5d8c68853e5f
taskId：task_924aab67-cea7-4d80-9e4f-5b4ae450c14c
runId：run_e197d76d-821a-40bd-9de6-033b599bc205
artifactId：art_07a8d67b-3ba7-47d2-8db1-263f2a6c008e
scheduleId：schedule_0186a432-e12a-4ae0-8388-a2b0838dd6ee
```

当前正式版结论仍为：

```text
NO-GO
```

原因不是已通过主链失效，而是 62 条场景尚未运行，F-011 之后仍有专用交互、异常恢复、人工验证、下载、反向修复和 48 条中断组合没有闭环证据。

## 3. 缺口分类原则

后续每个场景先分为四类：

| 类别 | 判定依据 | 处理方式 |
|---|---|---|
| 验收器缺口 | 产品能力存在，但运行器不能构造、驱动或判定该旅程 | 先补专用变体、夹具和结构化断言 |
| Flowise 编排缺口 | MCP 合同存在，但 Agentflow 没有连续可达路径 | 修改生成器、重建、发布、回读 |
| 产品合同缺口 | Harness/Worker/SQLite 缺少必需状态或原子操作 | 最小化修改合同和实现并加集成测试 |
| 证据缺口 | 代码和路径均存在，仅尚未实跑 | 不先改代码，直接执行并保存证据 |

禁止在实跑前把所有 `NOT_RUN` 统一登记为产品缺陷。

## 4. 当前最先修复的场景

### 4.1 F-011：视频低置信度动作逐项纠错

目标连续链：

```text
视频上传
→ FFmpeg/OCR/MiMo
→ 产生至少一个低置信度动作
→ Agent只展示待确认动作及来源
→ 用户用自然语言纠正该动作
→ Harness按版本保存CORRECT决定
→ 重建完整CaseDraft
→ 用户批准
→ Midscene
→ Builder
→ 纯Playwright
→ 2×2
→ 挂载
→ ON_DEMAND
→ PASSED
```

#### 当前实现事实

- `ingest_decision_submit` 已支持 `CONFIRM | CORRECT | REJECT`。
- `corrections` 已支持按 `ordinal` 提交完整修订草案。
- Flowise 已有附件修订输入节点。
- 视频入口、异步继续、视频草案修订和作者化主链已由 F-010 证明。

#### 当前真实缺口

1. `acceptance-ledger-execution-matrix-v1.json` 尚未绑定 F-011 变体。
2. `i10-stage8-live.cjs` 只注册到 F010，没有 F011 专用输入、低置信度夹具和纠错反馈。
3. 当前视频夹具不能确定性地产生“第 N 步低置信度”的可验收事实。
4. 当前附件修订是整份 CaseDraft 修订；需要证明单个低置信度动作的来源、原值、替换值和版本均保留。
5. `i10-ledger-runner.cjs` 尚无 F-011 的专用结构化验收规则。

#### 修复

1. 新增变体 `F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND`。
2. 生成可重复的视频夹具：包含一个被短暂遮挡、但其余步骤明确的点击动作。
3. Worker 输出必须包含：
   - 动作序号；
   - 时间戳；
   - 关键帧引用；
   - 原始脱敏观察；
   - 置信度；
   - `requiresUserConfirmation=true`。
4. Flowise 对该动作进入 `INPUT_REQUIRED`：
   - 只要求用户说明该动作；
   - `proceed` 只提交纠错，不批准案例；
   - `reject` 放弃该动作或整个导入，不静默接受。
5. Harness 使用 `CORRECT` 和 `expectedVersion` 原子写入新版本；旧版本保留审计。
6. 新草案只有在所有低置信度必确认项清零后才能进入 `CONFIRM_EXACT`。
7. 账本验收器必须断言：
   - 存在低置信度事实；
   - 存在 CORRECT 决定；
   - 修订后版本递增；
   - 原来源引用仍存在；
   - 未确认低置信度项为零；
   - 最终任务为 PASSED。

#### 停止规则

- 如果 MiMo 未真实产生低置信度事实，F-011 不能用人工伪造数据库行通过。
- 如果只能整份接受/拒绝而不能证明单动作修订，记 `FAIL`，建立 Flowise/合同缺陷。
- 如果视觉调用失败，失败关闭，不用 Playwright 推断代替。

### 4.2 F-012：视频与图片事实冲突后修订并保留候选

目标连续链：

```text
视频＋补充图片
→ 两种来源独立解析
→ 冲突检测
→ 不生成可批准草案
→ 用户选择权威事实
→ 生成带双来源溯源的新草案
→ 批准
→ Midscene/Builder/Playwright/2×2
→ 用户reject不挂载
→ 候选保留
```

#### 当前实现事实

- 视频导入已经通过 F-010。
- 图片 OCR/视觉事实、逐事实 `CONFIRM/CORRECT/REJECT` 已通过前序图片场景。
- `uploadFor` 已能随主输入附加图片。
- 候选拒绝激活并保留已经由 F-003/F-005/F-008 证明。

#### 当前真实缺口

1. 尚无 F-012 变体绑定和双来源冲突夹具。
2. 当前主链能同时上传视频和图片，但尚未证明二者进入同一权威事实聚合。
3. 尚未证明冲突未解决前禁止形成最终可批准草案。
4. 尚未证明修订草案同时保留 video frame 与 image fact 的 provenance。
5. 账本验收器尚无“双来源、冲突决定、不挂载”联合断言。

#### 修复

1. 新增变体 `F012_VIDEO_IMAGE_CONFLICT_RETAIN`。
2. 视频固定产生旧页面名“客户资料”，图片固定产生新页面名“个人资料”。
3. 聚合器按字段语义检测冲突，不以“后上传覆盖前上传”解决。
4. Flowise 显示：
   - 冲突字段；
   - 两个脱敏候选值；
   - 各自来源类型；
   - 用户只需说明采用哪一项。
5. Harness 保存冲突决定、决策版本和双来源引用，重建新草案。
6. 候选通过后在激活门槛执行 `reject`，验证：
   - activeVersion 未变化；
   - 未创建 run/schedule；
   - candidate/certificate/download 仍可查询。

### 4.3 F-013：Midscene 失败后同案例受控重试

当前底层具备失败关闭，但专用恢复入口尚未证明。

修复顺序：

1. 使用已批准 CaseDraft 注入一次可控视觉超时或定位失败。
2. 断言无 ActionTrace、无证书、无激活版本。
3. Flowise 展示失败摘要和“重新作者化同一案例”的唯一提案。
4. 恢复视觉条件后，以原 `caseId`、新幂等键创建新 authoring task。
5. 旧失败 task 保持可审计；新 task 通过完整 Builder/Playwright/2×2。
6. 用户 `reject` 不挂载，候选保留。

若只能新建完整旅程而不能引用原 caseId，应记为真实恢复入口缺陷。

### 4.4 F-014：人工验证两阶段暂停与同任务恢复

该场景不能靠 Mock 或普通登录页代替，必须有受控验证阻断页。

修复要求：

1. Worker 进入 `AWAITING_RUNTIME_VERIFICATION` 并产生 verificationId。
2. Agent 明确要求用户只在被测页面/设备操作，不在 Flowise 输入验证码、PIN、密码。
3. 第一次 `proceed` 仅提交 `USER_READY`。
4. 第二次 `proceed` 仅提交 `USER_ACTION_COMPLETED`。
5. 恢复原 taskId/runId，不新建任务。
6. `reject` 安全取消；重复、过期和跨版本决定失败关闭。
7. 不承诺自动读取短信、自动输入 PIN、自动按物理 U 盾或绕过 CAPTCHA。

## 5. F-015 至 F-024 的修复与验收顺序

### S4：候选、长任务、恢复和下载

| 场景 | 先验判断 | 必须补齐 |
|---|---|---|
| F-015 | 失败关闭合同存在，专用重验链未实跑 | 注入 Playwright/2×2 失败；不得签证；修订后完整四次重验 |
| F-016 | 异步轮询存在，45秒以上连续证据不足 | 同一 task/candidate 持续查询；不得重复提交 |
| F-017 | journey/candidate 恢复存在，跨会话稍后挂载未实跑 | 新 chatId 恢复同 candidate；精确版本和Hash激活 |
| F-022 | task/result 查询存在 | 未就绪时保持同 taskId；就绪后授予结果下载 |
| F-023 | 短时授权存在 | 过期重授权；Hash不一致失败关闭；执行Hash、证书Hash、下载Hash一致 |

### S5：调度与反向修复

| 场景 | 必须证明 |
|---|---|
| F-018 | 歧义时间停留在输入阶段；用户重填；展示唯一规范化计划；二次确认后才调度 |
| F-019 | 正式运行失败；用户拒绝修复；原脚本和调度状态不变 |
| F-020 | 失败分类；修复候选；Builder；纯Playwright；2×2；激活；复跑通过 |
| F-021 | 周期任务失败修复；旧计划不静默换Hash；显式创建新周期计划 |
| F-024 | 唯一调度精确确认后停用；服务重启后仍为停用 |

所有时间场景使用可控 Clock 完成未来时间、过去时间、IANA 时区、DST、misfire、重复提交和重启恢复；不能依赖等待真实长时间。

## 6. 48 条中断组合

只有 F-001 至 F-024 基础旅程稳定后，才执行矩阵中的 48 条指定组合。

每条中断证据必须包含：

```text
scenarioId
faultId
故障注入点
原操作是否已提交
最后稳定状态
原journeyId/taskId/scheduleId
恢复命令或恢复交互
重复副作用检查
最终出口
```

中断场景允许：

- `PASS`：恢复后到达预期稳定出口；
- `FAIL`：产品或验收器真实缺陷；
- `BLOCKED`：只有外部条件不可控，且记录 externalBlocker、lastStableState、recoveryCommand。

禁止用 `BLOCKED` 代替尚未执行。

## 7. 代码级实施阶段

### V4-S3B1：F-011 验收可执行化

- 扩展 execution matrix。
- 增加 F011 变体、低置信度视频夹具和反馈生成。
- 增加 ledger importer 专用断言。
- 增加 Worker/Harness 的低置信度决定测试。
- 重建并发布 Agentflow（仅当现有节点无法完成逐项纠错）。
- 实跑 F-011，导入账本。

退出条件：F-011 为 PASS，或形成带确切失败点的 FAIL；不得保持模糊 NOT_RUN。

### V4-S3B2：F-012 双来源冲突

- 增加 F012 变体和冲突图片。
- 完成双来源事实聚合、冲突确认、草案冻结。
- 验证不挂载出口。
- 实跑并导入 F-012。

### V4-S3C：F-013/F-014

- 增加 Midscene 可控失败与恢复注入。
- 增加受控人工验证页面和两阶段决定。
- 验证同 caseId、同 taskId 恢复语义。
- 实跑并导入。

### V4-S4：F-015/F-016/F-017/F-022/F-023

- 先做确定性异常注入与授权过期测试。
- 再执行连续 Flowise 旅程。
- 每条独立写证据，不共享终态冒充通过。

### V4-S5：F-018—F-021/F-024

- 接入统一可控 Clock。
- 完成调度修改、拒绝修复、修复复跑、新调度和停用持久化。

### V4-S6：工具、安全和中断矩阵

- 30 个 MCP 工具逐项保存成功、Schema失败、权限失败、版本冲突、幂等重放和 SQLite 前后状态。
- 使用专用假秘密扫描 Flowise、Harness、Worker、SQLite、日志、ActionTrace、源码、下载制品和验收证据。
- 执行 48 条中断组合。

### V4-S7：权威链收口

只有 72 条均不为 `NOT_RUN` 后执行：

1. 重判 R-001 至 R-074。
2. 生成最终机器可读账本。
3. 重建 Agentflow v4。
4. 公共 API 发布并回读 flowId、版本、内容 Hash、`deployed=true`。
5. 更新最终文件 Hash 清单。
6. 执行 `VERIFY.cmd --no-pause`。

## 8. 每个场景的固定验收资料

每条场景必须独立保存：

- flowId、flowVersion、flowHash；
- chatId、journeyId；
- 输入附件 SHA-256；
- MCP 调用序列；
- preparation/case/ingest/image/candidate/certificate/script/task/run/schedule/inbox/artifact 引用；
- 状态迁移；
- 四次稳定性 runId（适用时）；
- 用户选择和冻结载荷 Hash；
- 最终 acceptanceStatus；
- 失败时的 defectId、最后稳定状态和恢复入口。

结果入箱返回历史累计项时，验收器必须按本场景 taskId/runId/scheduleId 精确绑定，不能扫描到旧成功记录后误判本场景通过。

## 9. 当前优先级

```text
P0：F-011专用验收变体和低置信度逐项纠错
P0：F-012视频＋图片双来源冲突聚合
P0：F-014人工验证同任务恢复
P1：F-013作者化失败后同案例重试
P1：F-015—F-024异常、下载、调度与反向修复
P2：30工具真实矩阵、48条中断、安全扫描
P2：74项需求重判、发布回读、Hash和VERIFY
```

## 10. 最终完成门槛

只有同时满足以下条件，I10 才能由 `NO-GO` 改为 `GO`：

- F-001 至 F-024 全部具有独立连续运行结论；
- 48 条中断组合全部有可恢复或安全关闭证据；
- 无 `NOT_RUN`；
- 无未解释 `FAIL`；
- 无未经用户批准的 `BLOCKED`；
- MiMo/Midscene 为真实、非 Mock、非 degraded；
- 三入口、图片和视频均形成统一、可溯源 CaseDraft；
- 人工验证恢复同一 taskId；
- 候选、证书、执行和下载 Hash 一致；
- 立即、单次、周期和停用均有真实终态；
- 反向修复重新经过 Builder、纯 Playwright 和 2×2；
- 30 个 MCP 工具合同数、运行时数、Flowise引用数和真实矩阵证据数均为 30；
- 安全扫描满足已声明的平台边界；
- Agentflow 公共 API 回读一致且 `deployed=true`；
- `VERIFY.cmd --no-pause` 返回 `I10_PORTABLE_FOLDER_VERIFIED`。

在此之前，正确结论始终是：

```text
核心主链已真实可用；
F-001至F-010已通过；
正式版全量验收尚未完成；
I10 = NO-GO。
```
