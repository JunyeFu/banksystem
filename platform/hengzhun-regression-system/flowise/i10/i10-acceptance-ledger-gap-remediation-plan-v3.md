# 衡准 I10 验收账本缺口修复方案 v3

## 1. 文档定位

本文以桌面导出包的当前代码、当前 SQLite、当前已部署 Flowise Agentflow v4、2026-07-23 最新真实 Stage 8 运行和 I10 静态测试为依据，重新分析：

`flowise/i10/full-human-interaction-reasoning-ledger-v1.md`

本文是下一轮修复与验收的执行依据。它取代 `i10-acceptance-ledger-gap-remediation-plan-v2.md` 中已经被最新运行证据推翻的判断，但不删除 v1、v2 或 I9 历史。

固定边界：

- 当前运行权威仅为本桌面导出目录。
- 本轮先修产品与验收链，不重新导出目录、不生成 ZIP。
- 不修改 I9 历史证书、发布目录或证据。
- 不读取、输出或写入模型密钥、银行账号密码、验证码、PIN 或验证秘密。
- 不用 Playwright 成功冒充 Midscene 成功。
- 不用静态路径、Mock、降级结果或单元测试替代真实连续链验收。
- 只有结构化运行证据、SQLite 状态、制品 Hash 和用户可见终态一致时，才允许账本条目升级为 `PASS`。

## 2. 本次审计依据

### 2.1 静态和合同证据

执行：

```text
npm run test:i10:journey
```

结果：

```text
59 tests
59 passed
0 failed
```

已静态证明：

- Flowise v4 的入口秘密闸门位于主控 LLM 之前。
- `INITIAL_CASE_INPUT` 可在同一旅程补齐缺口。
- 图片事实、批量案例和人工验证均有可达路径。
- 异步候选、跨会话恢复、计划修订、调度、结果查询和受控修复节点可达。
- 运行时注册与权威合同均为 30 个 MCP 工具。
- MiMo/Midscene 分层诊断不会保留原始模型内容。

上述证据证明“实现骨架存在且合同一致”，不自动证明 72 条连续旅程已经通过。

### 2.2 Flowise 发布证据

当前发布清单显示：

```text
flowId: 7c14bafe-4c5b-4b4e-9d5a-000000000010
primaryFlowVersion: 4
deployed: true
mcpToolCount: 30
publishState: DEPLOYED_PRIVATE_PUBLIC_API_ROUND_TRIP_VERIFIED
```

当前 Agentflow 已通过公共 API 发布并回读。最终修复完成后仍需重新发布并再次核对内容 Hash。

### 2.3 最新真实连续链证据

最新自然语言无图案例已经真实完成：

```text
自然语言输入
→ 安全凭据引用
→ CaseDraft
→ 精确确认
→ MiMo v2.5 / Midscene 真实作者化
→ ActionTrace
→ 确定性 Builder
→ 纯 Playwright
→ I10_2X2_V1 四次验证
→ 脚本激活
→ ON_DEMAND 正式运行
→ 结果入箱
```

关键证据：

```text
candidateId:
candidate_77eff5e944caac9cff64777bc7b72ecd2cb7d042

certificateId:
certificate_285becc81c9c190de091be0490004a128b134d71

scriptId:
script_1f551610434bc36420751ab1b03081f9a235575c

taskId:
task_de0b98ef-49d5-416d-9ec6-86d709de7150

runId:
run_4c9d3ff9-5953-42ea-9d14-5aff15deeae6

inboxId:
inbox_02f86f78-cd05-4593-a260-28886ab43a8c

artifactId:
art_58ab1563-6eda-4087-912a-ee08da038930
```

SQLite 同时证明：

- candidate build job 为 `COMPLETED`；
- candidate 为 `SCRIPT_VALIDATED`；
- stability batch 为 `PASSED`；
- 四条 stability run 全部为 `PASSED`。

因此，v2 中“当前首要 P0 是 MiMo/Midscene 真实定位失败”的结论已经过期。

## 3. 重新分类后的公正结论

当前状态：

```text
自然语言无图正向核心能力：真实成功
Midscene真实作者化：真实成功
确定性脚本与四次稳定性：真实成功
按需正式执行与结果入箱：真实成功
Stage 8全矩阵：被验收器误判中止
旅程投影状态：存在真实不同步
图片、文件、视频、调度、反向修复连续证据：仍不足
72条连续旅程：未完成
正式版结论：NO-GO
```

缺口必须分成四类：

| 类别 | 含义 | 当前主要项目 |
|---|---|---|
| 产品缺陷 | 用户状态或业务状态真实错误 | 旅程状态未随候选和执行同步 |
| 验收器缺陷 | 产品成功但验证逻辑错误判失败 | Stage 8 依赖可见中文含内部英文状态码 |
| 证据缺口 | 代码存在但尚无真实连续运行 | 图片、批量、视频、验证、调度、修复 |
| 发布缺口 | 最终代码和清单尚未收口 | Hash 清单、完整 VERIFY |

## 4. 缺口清单与代码级修复

### GAP-V3-P0-01：Stage 8 正向终态判定发生假阴性

#### 现象

`scripts/i10-stage8-live.cjs` 当前按需正向分支要求：

```text
用户可见最终文本必须匹配 SUCCEEDED 或 PASSED
```

实际 Agent 回答是面向用户的中文简报：

```text
回归执行已结束，正式结果和脱敏证据已经写入衡准制品库。
```

同一 transcript 中已经存在有效 taskId、runId、inboxId、artifactId 和成功状态，但验收器仍抛出：

```text
I10_STAGE8_FORWARD_TERMINAL_MISSING
```

这是验收器缺陷，不是产品运行失败。

#### 责任层

- `scripts/i10-stage8-live.cjs`
- Stage 8 验收辅助函数与测试

#### 修复

1. 新增递归结构化证据查找器：
   - 查找与目标 taskId 对应的任务终态；
   - 要求任务状态为 `SUCCEEDED`；
   - 查找同 taskId 的结果入箱；
   - 要求 outcome 为 `PASSED`；
   - 要求存在 inboxId、artifactId；
   - 要求 executionMode 与本分支一致。
2. 用户可见文本只验证“语义终态已呈现”，接受：
   - 回归执行已结束；
   - 正式结果已形成；
   - 结果已写入制品库。
3. 禁止再要求用户可见文本暴露内部英文状态码。
4. 反向修复分支同样改为结构化判断，不用 `/SUCCEEDED|PASSED|修复/` 作为唯一成功依据。
5. 若结构化状态与用户可见文本冲突，判 `I10_STAGE8_TERMINAL_EVIDENCE_CONFLICT`，不得选择性相信其中一方。

#### 测试

- 中文简报＋结构化成功证据：通过。
- 中文简报＋任务仍运行：失败。
- 文本包含 `PASSED` 但无 inbox/artifact：失败。
- taskId 与 inbox 归属不一致：失败。
- 正向和反向终态分别覆盖。

#### 退出条件

同一份现有成功证据可被验收器正确识别，且伪成功输入不能通过。

---

### GAP-V3-P0-02：权威旅程状态未随下游业务状态同步

#### 现象

真实候选、稳定性、激活、正式任务和结果入箱均已完成，但对应 `i10_interaction_journeys` 仍为：

```text
stage: PROCESSING_AUTHORING
status: PROCESSING
version: 2
```

这会导致：

- 新会话恢复到错误阶段；
- 用户发送“继续”时得到过期状态；
- 账本将成功链误判为处理中；
- 幂等恢复可能重复查询或重复创建操作；
- Flowise 状态与 SQLite 业务权威状态不一致。

#### 责任层

- `harness/src/i10/service.ts`
- 候选、稳定性、激活、运行、调度和结果入箱状态转换点
- `journey_get` / `journey_resume` 投影逻辑
- Flowise v4 的恢复与状态简报节点

#### 修复

采用“业务表为权威、旅程为可重建投影”的规则：

1. 在旅程引用中绑定 preparationId、candidateId、scriptId、taskId、scheduleId、inboxId。
2. 每次读取旅程时，根据引用的业务表重建当前 stage/status，而不是只返回旧缓存。
3. 关键业务事务完成后同步更新旅程投影：
   - 候选处理中；
   - 候选待决定；
   - 已验证待激活；
   - 已激活待执行计划；
   - 正式运行中；
   - 人工验证等待；
   - 结果可用；
   - 失败待修复；
   - 修复候选待决定；
   - 已完成或已取消。
4. 投影更新与业务状态写入使用同一 SQLite 事务；不能先成功业务写入后留下永久旧旅程。
5. 为历史脏状态增加只读重建/修复函数；不得修改 I9 历史表。
6. 遇到引用冲突时失败关闭并返回明确错误，不自动选择“最新一条”。

#### 测试

- 从 authoring 到 result inbox 的每个状态点验证 journey 投影。
- 进程在任意写入点中断后，重启读取可从业务表重建。
- 新会话用 journeyId、candidateId 或 taskId 恢复到同一阶段。
- 重复恢复不创建重复候选、任务或调度。
- 旧页面 proposal/version 仍被拒绝。

#### 退出条件

最新成功链对应旅程被重建为结果已就绪终态；跨会话恢复不再返回 `PROCESSING_AUTHORING`。

---

### GAP-V3-P0-03：Stage 8 运行矩阵缺少可断点续跑的账本执行器

#### 现象

当前 Stage 8 在第一个正向场景被假阴性中止，后续场景没有执行。账本要求的 24 条基础旅程和 48 条中断组合尚未形成 72 条独立证据。

#### 责任层

- `scripts/i10-stage8-live.cjs`
- `.data/evidence/i10/stage8/`
- 机器可读验收汇总

#### 修复

1. 为每个 `F-xxx` 和 `F-xxx+I-yy` 分配稳定 scenarioId。
2. 每个场景独立保存：
   - flowId、flowVersion、flowHash；
   - chatId、journeyId；
   - 输入附件 Hash；
   - MCP 调用序列；
   - candidate/certificate/script/task/schedule/inbox/artifact ID；
   - 四次 runId；
   - 关键状态迁移；
   - 最终结论和恢复点。
3. 运行器在场景间保存 checkpoint；某场景失败后：
   - 记录 `FAIL` 或 `BLOCKED`；
   - 对不依赖该缺陷的场景继续；
   - 修复后只重跑失败场景及受影响派生场景。
4. 运行器不能把 `BLOCKED` 当成未执行的代名词。必须有外部阻断、最后稳定状态和恢复命令。
5. 输出机器可读 `ledger-run-summary.json`，并由账本生成器回填三状态：
   - implementationStatus；
   - evidenceStatus；
   - acceptanceStatus。

#### 退出条件

72 个 scenarioId 均有独立运行记录，无 `NOT_RUN`，无未经批准的 `BLOCKED`。

---

### GAP-V3-P1-01：图片和三入口组合缺少真实 E2E

#### 当前实现

图片、文件、视频、图片事实决定和批量决定的代码及 Flowise 路径已经存在；旧账本中“完全没有路由”的结论已不再准确。但真实连续证据仍不足。

#### 需要完成的顺序

1. 自然语言＋单张中英文图片。
2. 自然语言＋多图重复或冲突。
3. 仅图片＋最少目标补充。
4. 单案例 XLSX、CSV、DOCX、JSON。
5. 多案例文件，逐项接受、修订和拒绝。
6. 文件＋图片事实合并。
7. 视频抽帧、OCR、视觉分析。
8. 视频低置信度动作逐项修订。
9. 视频＋补充图片冲突解决。

#### 修复要求

- 三类主输入和补充图片最终生成同版 `CaseDraft`。
- 图片事实必须包含 OCR、视觉、来源 Hash、用户决定和置信度溯源。
- 未确认事实不得进入正式草案。
- 多案例不得静默只取第一项。
- 低置信度项必须逐项决定，不能只整份接受。
- 非法格式、超限、Magic 不符、路径越界和附件替换均失败关闭。

#### 退出条件

账本 F-004 至 F-012 获得真实连续证据和稳定出口。

---

### GAP-V3-P1-02：人工验证暂停、两阶段确认和同任务恢复缺少现场证据

#### 当前实现

Harness、Worker 和 Agentflow 已有验证挑战路径，静态测试覆盖两阶段决定与取消；尚未证明真实浏览器阻断后可恢复同一 taskId。

#### 修复/验收

1. 在受控被测页面触发验证码、扫码或外部设备验证挑战。
2. Worker 写入 `AWAITING_RUNTIME_VERIFICATION`。
3. Flowise 明确提示：
   - 不在对话中输入验证码、PIN 或密码；
   - 用户只在被测页面或设备完成操作。
4. 第一次 `proceed` 仅表示 `USER_READY`。
5. 第二次 `proceed` 仅表示 `USER_ACTION_COMPLETED`。
6. `reject` 取消本次运行。
7. 重复、过期、跨版本决定失败关闭。
8. 恢复后继续同一 taskId/runId，不新建任务。

明确不承诺：

- 读取短信验证码；
- 自动输入 PIN；
- 自动按物理 U 盾；
- 绕过 CAPTCHA 或审批。

#### 退出条件

F-014 以及相关中断组合获得真实暂停、人工完成和恢复证据。

---

### GAP-V3-P1-03：单次、周期、停用、反向修复和可控时钟尚未闭环

#### 修复

1. 统一 Harness `Clock`：
   - 生产 UTC 系统时钟；
   - 测试固定、推进和跳跃时钟。
2. 覆盖 `ON_DEMAND`、`ONE_TIME`、`RECURRING`。
3. 覆盖：
   - IANA 时区；
   - 夏令时跳变；
   - 过去时间；
   - misfire；
   - 幂等重复；
   - 调度停用；
   - 重启恢复；
   - 提案和下载授权过期。
4. 注入真实可控定位器失败：
   - 失败分类；
   - 用户拒绝修复；
   - 用户批准修复；
   - 修复候选 Builder；
   - 纯 Playwright；
   - 2×2；
   - 激活/不激活；
   - 复跑；
   - 新调度。
5. 旧调度不得静默替换脚本 Hash；必须显式停用或新建。

#### 退出条件

F-018 至 F-024 和时间相关中断组合全部通过。

---

### GAP-V3-P1-04：源码下载、结果下载和跨会话恢复证据不足

#### 修复/验收

- 完整 `.cjs` 下载 Hash 等于 candidate、certificate 和 execution Hash。
- 短时链接过期后只能重新授权，不能复用旧授权。
- Hash 不一致时失败关闭，不允许挂载或执行。
- 结果尚未就绪时重复查询同 taskId，不重复提交运行。
- 新会话按 journeyId、candidateId、taskId、scheduleId 恢复到唯一状态。
- 候选选择“不挂载”后可在新会话再次查看并决定，但不自动激活。

#### 退出条件

F-017、F-022、F-023 和相应 I-06/I-11/I-12 组合通过。

---

### GAP-V3-P2-01：30 个 MCP 工具缺少全量真实行为矩阵

静态合同已证明注册数为 30。仍需为每个工具保存：

- 成功调用；
- schema 失败；
- 权限失败；
- 版本冲突；
- 幂等重放；
- 权威返回引用；
- SQLite 前后状态。

无需模型的工具直接做确定性真实调用；浏览器、OCR、Midscene 和调度工具必须绑定相应真实运行证据。

退出条件：

```text
合同工具数 = 30
运行时注册数 = 30
Flowise引用工具数 = 30
具有真实矩阵证据的工具数 = 30
```

---

### GAP-V3-P2-02：安全零泄漏边界需要按真实平台边界重测

仅使用专用假秘密，扫描：

- Flowise SQLite、聊天记录和日志；
- 主控/视觉模型请求证据；
- Harness SQLite 和日志；
- MCP/Worker 日志；
- ActionTrace、截图、视频帧；
- Playwright 源码；
- 下载制品；
- 发布目录；
- 恢复账本与验收证据。

若 Flowise 平台在入口节点执行前已经持久化用户原始消息，必须把该事实记为平台边界，不能宣称“Flowise 数据库绝对零明文”。产品可证明的门槛应是：

```text
秘密不进入外部模型、业务SQLite、脚本、证据和发布制品；
对话平台自身原始消息保存边界被明确披露并提供用户警示。
```

---

### GAP-V3-P2-03：账本正文仍混合实现状态与验收状态

账本旧的单字段“当前结论”会把：

- 已实现但未运行；
- 已运行但验收器误判；
- 真实产品缺陷；
- 预期失败关闭

混在一起。

修复：

为 R-001 至 R-074 和 F-001 至 F-024 增加：

```text
implementationStatus = IMPLEMENTED | PARTIAL | MISSING
evidenceStatus       = STATIC_ONLY | DETERMINISTIC_TESTED | LIVE_PARTIAL | LIVE_PASSED
acceptanceStatus     = PASS | FAIL | BLOCKED | NOT_RUN
defectIds            = []
evidenceRefs         = []
lastVerifiedAt
```

历史描述不删除；新增“当前重判”区，并由机器可读账本汇总生成。

---

### GAP-V3-P2-04：发布 Hash 清单在最终修复前保持未收口

本轮及后续还会修改生成器、Harness、验收器、测试和 Agentflow。Hash 清单只能在全部行为稳定后更新。

最终步骤：

1. 重建 Agentflow v4。
2. 通过公共 API 发布并回读。
3. 核对 flowId、版本、内容 Hash、`deployed=true`。
4. 更新实际新增/修改文件和聚合项。
5. 运行完整：

```text
VERIFY.cmd --no-pause
```

6. 最终结果必须为：

```text
I10_PORTABLE_FOLDER_VERIFIED
```

## 5. 实施阶段

### V3-S0：修复验收器假阴性

- 实现结构化 task/inbox/artifact 终态验证。
- 同步修复正向和反向分支。
- 加入真假终态回归测试。
- 使用现有成功证据重放，不重复创建业务任务。

退出条件：关闭 `GAP-V3-P0-01`。

### V3-S1：修复旅程投影和跨会话恢复

- 建立业务表到旅程状态的确定性投影。
- 修复历史卡在 `PROCESSING_AUTHORING` 的当前 I10 旅程。
- 覆盖中断、重启、重复恢复和旧 proposal。

退出条件：关闭 `GAP-V3-P0-02`。

### V3-S2：重跑自然语言无图主干并建立断点账本

- 从新会话执行 F-001。
- 验证 ActionTrace、Builder、2×2、下载、激活、正式运行、入箱。
- 保存完整结构化证据。
- 验证 F-002、F-003 和不挂载分支。

退出条件：无图正向族稳定通过，Stage 8 能继续到下一场景。

### V3-S3：三入口、图片、批量和人工验证

- 按 `GAP-V3-P1-01` 顺序执行。
- 完成人工验证两阶段恢复。
- 修复发现的真实流程缺陷。

退出条件：F-004 至 F-014 通过。

### V3-S4：候选失败、长任务、下载和跨会话

- 纯 Playwright/2×2 失败与重验。
- 候选超过等待窗口后继续查询。
- 不挂载候选跨会话再激活。
- 下载过期与 Hash 不一致。

退出条件：F-015 至 F-017、F-022、F-023 通过。

### V3-S5：调度、反向修复和可控时钟

- 三种执行方式。
- 计划修订。
- 调度停用和重启。
- 正向失败后的两种用户决定。
- 修复候选、2×2、激活、复跑和新调度。

退出条件：F-018 至 F-024 通过。

### V3-S6：30 工具、安全和中断矩阵

- 完成 30 工具真实矩阵。
- 完成假秘密扫描。
- 执行 48 条指定中断组合。

退出条件：工具数一致；安全门槛通过；所有中断可恢复或安全关闭。

### V3-S7：账本和发布收口

- 执行器汇总 72 条运行。
- 重判 R-001 至 R-074。
- 生成机器可读汇总。
- 发布 Agentflow。
- 更新 Hash。
- 运行完整 VERIFY。

退出条件：无 `NOT_RUN`、无未解释 `FAIL`、无未经批准 `BLOCKED`，并返回 `I10_PORTABLE_FOLDER_VERIFIED`。

## 6. 测试分层与停止规则

```text
L1  TypeScript/Node语法、单元测试
L2  Agentflow图、30工具合同
L3  Harness/SQLite/Worker集成
L4  真实控制模型与MiMo/Midscene
L5  自然语言无图连续链
L6  图片、文件、视频、人工验证
L7  调度、修复、下载、恢复
L8  30工具和48条中断
L9  72条运行与74项重判
L10 发布回读、Hash和完整VERIFY
```

上一层失败时：

- 记录真实失败；
- 保留最后稳定状态；
- 不降低门槛；
- 不把更高层标为通过；
- 可以继续执行与该失败无依赖的并列场景。

## 7. 最终完成门槛

I10 只有同时满足以下条件才可从 `NO-GO` 改为 `GO`：

- Stage 8 不再把中文用户简报误判为运行失败。
- 旅程状态与候选、任务、调度、入箱权威状态一致。
- MiMo/Midscene 真实作者化为非 Mock、非 degraded。
- 三入口与图片组合形成统一 CaseDraft。
- 人工验证暂停并恢复同一 taskId。
- Builder、纯 Playwright 和 2×2 全部通过。
- 下载、执行和证书 Hash 一致。
- 挂载、不挂载、稍后挂载均有真实证据。
- 立即、单次、周期执行均产生可查询终态。
- 反向修复完整走完生成、复验、决定、复跑和可选调度。
- 30 个 MCP 工具具备真实行为矩阵。
- 可控时钟与租约恢复可重复。
- 72 条连续运行无未执行项。
- 74 个等价类完成当前重判。
- 安全扫描在明确的平台边界内满足门槛。
- Agentflow 公共 API 回读一致且 `deployed=true`。
- 完整 VERIFY 返回 `I10_PORTABLE_FOLDER_VERIFIED`。

## 8. 当前结论

截至 2026-07-23 18:19 的最新账本：

```text
总场景：72
PASS：6
FAIL：0
BLOCKED：0
NOT_RUN：66

已通过：F-001 至 F-006
下一条：F-007
已关闭：Stage 8中文终态假阴性、旅程投影不同步、自然语言/图片入口首批缺口
已证明：自然语言无图、自然语言加图、多图冲突、纯图片补充、按需、单次、周期和不挂载出口
尚未证明：文件、视频、人工验证、异常作者化、下载恢复、反向修复和48条中断组合
正式版结论：NO-GO
```

这次审计提升的是“缺陷定位准确性”和“后续验收可执行性”。它已经证明核心作者化与正式运行能力真实存在，但尚未形成全量账本通过证据，因此不能据此宣称正式版完成。

## 9. F-006 实跑发现及已落地修复

F-006 的目标连续链为：

```text
纯图片输入
→ 主控模型要求补充业务目标
→ 用户补充自然语言
→ 本机安全凭据
→ 图片OCR/视觉事实确认
→ CaseDraft
→ Midscene真实作者化
→ Builder生成Playwright
→ 纯Playwright与2×2
→ 激活
→ 周期执行
→ 真实结果入箱
→ 停用周期计划
```

该链真实暴露并关闭了以下三项缺陷。

### GAP-V3-F006-01：纯附件消息被Flowise当作空问题

- 根因：Flowise运行时只以文本 `question` 判定输入是否为空，忽略有效的 `fileUploads`。
- 修复：仅当附件存在且问题为空时，生成内部不透明标记
  `[I10_ATTACHMENT_ONLY_INPUT]`；输入安全闸门允许该标记进入分类器，但不允许普通空输入绕过。
- 确定性分类：纯图片固定进入 `CASE_AUTHORING/NATURAL_LANGUAGE`，图片进入
  `supportingImages`，自然语言保持空白并触发补充。
- 验证：F-006 已真实产生 `image_ingest_submit/get/decision_submit` 证据。

### GAP-V3-F006-02：凭据录入后恢复了旧空草案

- 根因：凭据页面返回后直接装配凭据录入前的草案，没有重新结构化用户同轮补充的业务目标。
- 修复：新增凭据恢复结构化与规范化节点；使用当前自然语言、已确认图片事实和有效
  `credentialRef` 重建同一旅程草案，再调用 `journey_input_submit`。
- 安全边界：模型和草案仅接触 `credentialRef`，不接触明文账号密码。
- 验证：F-006 已从凭据录入返回同一旅程并完成后续作者化。

### GAP-V3-F006-03：Worker任务领取响应超过L0输出预算

- 现象：调度已触发，任务事务已被领取，但Worker没有收到成功响应；任务停在
  `RUNNING/10%` 并反复续租。
- 根因：内部 `/internal/worker/tasks:claim` 响应包含案例定义和受控执行载荷，
  实际大小超过8 KiB的L0会话预算；数据库领取事务先提交，响应序列化后失败。
- 修复：仅该内部领取端点使用有界L1 16 KiB预算；没有放宽对话、MCP或其他公开接口。
- 回归测试：`worker-claim-output-budget.test.cjs` 固定验证端点预算，TypeScript构建通过。
- 验证：修复后的周期任务
  `task_3db4b756-c0e5-4bd9-8f13-fef958c41720`
  由Worker真实领取并以 `PASSED` 完成。

F-006 最终证据：

```text
scheduleId：schedule_752e04a3-37b9-4868-ab4d-ed3153e60ce4
taskId：task_3db4b756-c0e5-4bd9-8f13-fef958c41720
runId：run_5df09ffd-9cea-46fa-8028-65f338d7828b
artifactId：art_3bed9fcd-3e3c-4175-8dd5-ccccd2c331b2
正式结果：PASSED
周期计划终态：DISABLED
Mock：false
degraded：false
```

## 10. 剩余66条的实际修复与验收顺序

剩余项目不统一标记为“缺实现”。每条必须先执行，只有真实失败后才建立缺陷；未执行保持
`NOT_RUN`，不得改写为 `BLOCKED`。

### V3-S3A：文件入口 F-007 至 F-009

1. F-007：单案例文件批准、挂载、周期执行及停用。
2. F-008：附件草案拒绝、同旅程修订、批准、不挂载。
3. F-009：文件与关键图片合并、来源核对、挂载、立即执行。

重点检查：

- XLSX/CSV/DOCX/JSON解析是否形成同版CaseDraft；
- 批量导入是否逐项决定而非静默取第一条；
- 文件Hash、图片Hash和用户决定是否完整进入溯源；
- 附件修改后是否冻结新版本和新载荷Hash；
- 周期任务领取报文继续保持在内部L1预算内。

### V3-S3B：视频入口 F-010 至 F-012

1. F-010：MP4/H.264抽帧、OCR、MiMo分析、挂载、单次执行。
2. F-011：低置信度动作逐项纠正后挂载和立即执行。
3. F-012：视频与补充图片冲突，用户修订后批准并保留候选。

重点检查：

- FFmpeg、OCR、MiMo均有真实调用证据；
- 低置信度事实在确认前不得进入CaseDraft；
- 视频视觉失败时不得以Playwright补推冒充成功；
- 临时帧在形成脱敏证据后按策略清理。

### V3-S3C：作者化与人工验证 F-013 至 F-014

- F-013：注入可控Midscene失败，受控重试，候选通过但不挂载。
- F-014：浏览器真实进入验证阻断，两阶段人工确认后恢复同一taskId。

人工验证只允许用户在被测页面或设备完成验证码、扫码、U盾等动作；Flowise不得接收验证码、
PIN或设备秘密，也不承诺自动按压物理设备。

### V3-S4：候选、长任务、下载和跨会话

- F-015：Playwright或2×2失败，不签证，修订后完整重验。
- F-016：候选超过45秒，同一任务持续查询后到达终态。
- F-017：不挂载候选在新会话恢复并再次激活。
- F-022：结果未就绪时查询同一taskId，完成后下载。
- F-023：下载过期或Hash不一致，重新授权并核对。

### V3-S5：调度与反向修复

- F-018：歧义调度输入被拦截，重填后展示唯一方案并二次确认。
- F-019：正式运行失败，用户拒绝修复，原状态保持。
- F-020：正式失败、修复候选、Builder、纯Playwright、2×2、激活与复跑。
- F-021：周期失败修复后复跑，并显式创建新周期计划。
- F-024：查询唯一调度、精确确认、停用，重启后仍停用。

### V3-S6：48条中断组合

基础旅程全部稳定后，按矩阵执行12类中断、每类4条，不做无差别笛卡尔积。每条必须记录：

- 故障注入点；
- 原操作是否提交；
- 最后稳定状态；
- 恢复所用原journeyId/taskId/scheduleId；
- 是否发生重复副作用；
- 最终出口。

### V3-S7：最终收口

只有当72条均不再是 `NOT_RUN` 后才执行：

1. 30个MCP工具真实行为矩阵。
2. 专用假秘密全边界扫描。
3. R-001至R-074当前重判。
4. Agentflow公共API重新发布并回读。
5. 最后一次更新Hash清单。
6. `VERIFY.cmd --no-pause`。

当前禁止提前更新最终Hash或宣称正式版完成。
