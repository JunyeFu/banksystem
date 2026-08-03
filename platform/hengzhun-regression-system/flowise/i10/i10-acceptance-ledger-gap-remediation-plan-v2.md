# 衡准 I10 验收账本缺口修复方案 v2

## 1. 文档定位

本文以桌面导出目录当前代码、当前 SQLite 状态、Flowise 已发布 Agentflow、真实模型探针和最近一次 Stage 8 运行证据为依据，对以下账本进行现状重判：

`flowise/i10/full-human-interaction-reasoning-ledger-v1.md`

本文覆盖并取代 `i10-continuous-flow-gap-remediation-plan-v1.md` 中“尚未落地”的历史判断，但不删除 v1。v1 继续保留为需求来源和实施历史；v2 是后续修复和验收的当前执行依据。

固定边界：

- 当前运行权威仅为本桌面导出目录。
- 不重新导出目录，不生成 ZIP。
- 不修改 I9 历史证书和证据。
- 不读取、打印或写入模型密钥、银行账号密码和验证秘密。
- 不用 Playwright 成功冒充 Midscene 成功。
- 不用 Mock、降级结果、节点存在或单元测试通过冒充真实连续链路通过。
- 只有账本运行项产生完整权威 ID、状态迁移、制品 Hash 和终态证据后，才允许标记 `PASS`。

## 2. 审计结论

### 2.1 总结论

当前代码已经关闭 v1 中大部分“实现缺失”，但验收账本仍主要记录修复前结论，尚未用修复后的真实运行证据重判。

当前结论为：

```text
实现完整度：大部分交互基础能力已落地
静态与合同证据：较充分
真实连续链证据：不足
当前产品门槛：NO-GO
```

最近一次真实自然语言入口运行已完成：

```text
用户输入
→ 入口安全闸门
→ 主控模型结构化
→ 确定性 CaseDraft 规范化
→ 冻结草案
→ proceed 精确确认
→ case_prepare
→ 候选任务提交
```

随后真实失败在：

```text
MiMo v2.5
→ Midscene aiLocate
→ I10_MIDSCENE_MODEL_CALL_FAILED
```

因此当前没有任何一条完整流程获得：

```text
ActionTrace
→ Builder
→ 纯 Playwright
→ I10_2X2_V1
→ script.cjs 下载
→ 挂载/不挂载
→ 立即/单次/周期执行
→ 结果回读
```

### 2.2 旧账本不能直接作为当前统计

账本共记录 74 个离散等价类和 24 条连续流程。账本正文仍包含修复前的：

- `INTERRUPTED_NO_ROUTE`
- `FAIL_OPEN_RISK`
- `UNVERIFIED`
- `CONDITIONAL_PASS`

其中部分对应代码已经落地，不能继续视为“未实现”；但在真实连续验收完成前，也不能直接升级为 `PASS`。

后续重判必须使用三个字段：

```text
implementationStatus = IMPLEMENTED | PARTIAL | MISSING
evidenceStatus       = STATIC_ONLY | DETERMINISTIC_TESTED | LIVE_PARTIAL | LIVE_PASSED
acceptanceStatus     = PASS | FAIL | BLOCKED | NOT_RUN
```

禁止再用一个“当前结论”同时表达实现和验收。

## 3. 当前能力盘点

| 能力 | 当前代码状态 | 当前证据 | 当前判断 |
|---|---|---|---|
| 唯一 Agentflow 生成权威与能力保持 | 已实现 | 图可达性、能力清单、Human Input 分支测试 | 待随最终图重新发布并回读 |
| 初始空白和秘密输入闸门 | 已实现 | 确定性测试、入口 Flow State 路由 | Flowise 原始消息持久化边界仍需真实假秘密探针 |
| `INITIAL_CASE_INPUT` 同旅程补齐 | 已实现 | Harness 状态机测试、Flowise 路径 | 待真实多轮对话 |
| 图片提交、OCR、事实决定和草案绑定 | 已实现基础 | 迁移、MCP、决定测试、Agentflow 能力路径 | 待三入口真实图片 E2E |
| 多案例逐项决定 | 已实现基础 | 批量决定测试 | 待真实 XLSX/CSV/DOCX/JSON 批量 E2E |
| 人工验证两阶段决定 | 已实现基础 | Harness 测试、Flowise 路径 | 待验证码/U盾等真实阻断流程 |
| 异步候选继续查询 | 已实现 | 状态路径和恢复逻辑 | 待长任务真实恢复 |
| 执行计划 reject 后修订 | 已实现 | Agentflow 能力路径 | 待单次和周期调度真实对话 |
| 跨会话恢复 | 已实现基础 | journey 引用测试 | 待关闭浏览器/新会话真实恢复 |
| 过期图片/视频租约回收 | 已实现 | 故障注入测试 | 待 Worker 真实中断恢复 |
| MCP 合同 | 30 个工具一致 | 合同注册测试 | 尚未完成 30 工具真实运行矩阵 |
| 可控时钟 | 未完整实现 | 无完整固定/推进/跳跃时钟证据 | 明确缺口 |
| Midscene 真实作者化 | 路径存在但当前失败 | 真实 MiMo 调用失败 | 当前首要 P0 |
| 72 条账本运行矩阵 | 未完成 | 只有首条自然语言链的部分证据 | 当前最终 P0 |

## 4. 当前缺口

### GAP-V2-P0-01：MiMo/Midscene 真实定位调用失败且诊断不足

现象：

- 主控模型真实探针通过。
- MiMo 截图理解启动探针通过。
- Midscene 已生成受控 16K/12K/4K 上下文并进入 `aiLocate`。
- 第一个 `LOGIN_USERNAME` 视觉定位连续失败。
- Worker 最终只保留通用错误 `I10_MIDSCENE_MODEL_CALL_FAILED`。
- 当前日志无法区分：
  - HTTP/鉴权/限流；
  - MiMo 响应报文与 Midscene `qwen-vl` 解析器不兼容；
  - 工具或结构化输出缺失；
  - 模型返回候选但被受控目标一致性校验拒绝；
  - 截图或提示长度超限。

根因风险：

当前 catch 把底层安全错误信息全部折叠为一个错误码，无法制定准确修复，也无法证明 MiMo 满足 Midscene 作者化合同。

修复：

1. 为每次 `aiLocate` 记录脱敏诊断：
   - attempt；
   - HTTP status；
   - error class/code；
   - response parser stage；
   - 是否收到模型内容；
   - 是否通过 Midscene schema；
   - 是否通过目标一致性校验；
   - 输入/输出估算 Token；
   - 截图尺寸和 Hash。
2. 禁止记录请求头、API Key、完整模型响应、页面输入值和凭据。
3. 将失败细分为：
   - `I10_MIDSCENE_TRANSPORT_FAILED`
   - `I10_MIDSCENE_RESPONSE_SCHEMA_INVALID`
   - `I10_MIDSCENE_TARGET_VALIDATION_FAILED`
   - `I10_MIDSCENE_CONTEXT_LIMIT_EXCEEDED`
   - `I10_MIDSCENE_MODEL_TIMEOUT`
4. 使用同一截图执行一个最小 `aiLocate` 兼容性探针，先验证模型响应能被 Midscene 解析，再运行完整作者化。
5. 若 MiMo 需要与 Qwen3.5 等价但不同的模型族配置，只允许调整公开的兼容配置和报文适配层，不得放宽 16K/12K/4K 门槛。
6. 任何视觉失败继续失败关闭；不得改用 Playwright 定位作为“作者化成功”。

Go 条件：

- MiMo 真实调用 `mock=false`、`degraded=false`。
- `LOGIN_USERNAME`、`LOGIN_PASSWORD`、登录按钮、姓名、头像和个人资料入口均产生可审计视觉定位。
- 每个视觉候选通过受控目标一致性校验。
- 生成完整、脱敏 `ActionTrace`。

### GAP-V2-P0-02：首条无图主干尚未走到终态

修复顺序：

```text
Midscene兼容性
→ ActionTrace
→ Builder
→ 纯Playwright
→ 2视口×2次
→ 源码Hash一致
→ 用户选择挂载或不挂载
→ 立即执行
→ 结果收件箱
```

必须先关闭无图自然语言主干，再扩展三入口和反向流程。否则后续失败无法区分是入口问题还是作者化核心问题。

Go 条件：

- 四次验证包含四个唯一 runId，任意一次失败均不签证。
- `.cjs` 下载 Hash、执行 Hash、证书 Hash 一致。
- “不挂载”不激活、不创建运行；“挂载”只激活页面所示精确版本。
- 立即执行产生终态 taskId 和可下载脱敏结果。

### GAP-V2-P0-03：账本连续流程没有全量运行证据

当前账本的 24 条连续流程不能由 74 个离散节点测试推导为通过。

修复：

1. 为每条连续流程生成固定 `flowId` 和运行实例 `runId`。
2. 每次保存：
   - 用户输入和 Agent 用户可见回答；
   - Flowise 节点轨迹；
   - MCP 调用顺序；
   - 权威业务 ID；
   - SQLite 前后状态；
   - 制品 Hash；
   - 模型 `mock/degraded`；
   - 最终出口。
3. 每条只允许：
   - `PASS`
   - `FAIL`
   - `BLOCKED`
   - `NOT_RUN`
4. `BLOCKED` 必须包含外部阻断、最后稳定状态和恢复命令；不能用作未执行的替代词。

Go 条件：

- 72 个运行组合全部执行。
- 每条 `PASS` 有完整证据。
- 无未经批准的 `BLOCKED`。

### GAP-V2-P1-01：三入口与图片组合缺少真实连续 E2E

按以下顺序执行，避免排列组合失控：

1. 自然语言，无图。
2. 自然语言＋中英文图片。
3. 单案例文件，无图。
4. 单案例文件＋图片。
5. 多案例文件＋图片，部分接受和部分拒绝。
6. 视频，无图。
7. 视频＋图片，包含低置信度 OCR 修订。

每条最终必须形成同版 `CaseDraft`，并证明：

- 图片事实未经用户确认不会进入正式案例。
- 文件/视频不得静默只取第一项。
- 图片事实保留 OCR、视觉调用和人工决定溯源。

### GAP-V2-P1-02：人工验证暂停与恢复缺少现场证据

修复/验收：

1. 在受控页面触发验证挑战。
2. Worker 把同一 taskId 同步到 `AWAITING_RUNTIME_VERIFICATION`。
3. Flowise 提示用户只在被测页面/设备完成操作。
4. 第一次 `proceed` 仅表示 `USER_READY`。
5. 第二次 `proceed` 仅表示 `USER_ACTION_COMPLETED`。
6. `reject` 取消本次执行。
7. 重复、过期、跨版本决定失败关闭。

不作出的主张：

- 自动读取短信验证码；
- 自动输入 PIN；
- 自动按物理 U 盾按键；
- 自动通过 CAPTCHA。

### GAP-V2-P1-03：调度和反向修复缺少连续证据

必须分别完成：

- `ON_DEMAND`
- `ONE_TIME`
- `RECURRING`
- 计划 reject 后同旅程修改
- 错过执行
- 重复提交
- 停用调度
- 重启恢复
- 定位器失效
- 修复候选
- 修复候选 2×2
- 激活/不激活修复
- 修复复跑

普通脚本与修复脚本使用同一调度合同和同一四次稳定性规则。

### GAP-V2-P1-04：可控时钟未完整实现

修复：

1. Harness 所有调度、过期、租约和一次性授权时间读取统一 `Clock`。
2. 生产使用 UTC 系统时钟。
3. 测试支持固定、推进和跳跃时钟。
4. 覆盖：
   - IANA 时区；
   - 夏令时跳变；
   - 过去时间；
   - misfire；
   - 确认过期；
   - 下载授权过期；
   - 服务重启后补偿。

Go 条件：

- 不依赖真实等待数小时或修改系统时间。
- 时间相关测试可重复。

### GAP-V2-P2-01：30 个 MCP 工具只证明合同一致，未证明全量真实运行

修复：

为每个工具记录：

- 成功；
- schema 失败；
- 权限失败；
- 版本冲突；
- 幂等重放；
- 真实返回引用；
- SQLite 状态变化。

模型不参与即可完成的合同路径使用确定性真实调用；需要浏览器、OCR、Midscene 或调度器的路径必须连接真实运行证据，不接受 Mock。

### GAP-V2-P2-02：安全零泄漏边界需要重新实测

使用专用假秘密，不使用真实密钥或银行凭据，扫描：

- Flowise SQLite 和日志；
- LLM 请求证据；
- Harness SQLite 和日志；
- MCP/Worker 日志；
- ActionTrace；
- 截图和视频帧；
- Playwright 源码；
- 下载制品；
- 发布目录。

如果 Flowise 在入口闸门前持久化原始聊天消息，则必须明确记录平台边界，不能声称 Flowise 数据库零明文。

### GAP-V2-P2-03：发布 Hash 清单已过期

当前生成器、Harness、MCP、Worker、测试和生成的 Agentflow 已发生修改。

修复：

1. 全部代码和真实验收稳定后再更新清单。
2. 只更新实际新增或修改文件及 `dist` 聚合项。
3. 运行完整 `VERIFY.cmd --no-pause`。
4. 结果必须为 `I10_PORTABLE_FOLDER_VERIFIED`。

在此之前不得把当前目录标记为完整性验证通过。

## 5. 实施顺序

### V2-S0：证据冻结与账本结构升级

- 冻结当前失败 jobId、模型配置公开指纹、Agentflow Hash 和日志时间范围。
- 给账本增加实现、证据、验收三个状态字段。
- 不修改历史结论；新增“修复后重判”栏。

退出条件：

- 当前失败可复现。
- 证据不含秘密。

### V2-S1：Midscene 诊断与兼容性修复

- 增加脱敏分层错误。
- 运行最小截图定位探针。
- 修复 MiMo/Midscene 报文或模型族兼容。
- 完成门户登录 ActionTrace。

退出条件：

- `GAP-V2-P0-01` 关闭。

### V2-S2：自然语言无图主干

- 生成脚本。
- 纯 Playwright。
- 2×2。
- 下载。
- 不挂载分支。
- 挂载与立即执行分支。

退出条件：

- `GAP-V2-P0-02` 关闭。

### V2-S3：三入口、图片、批量和人工验证

- 按 P1-01 顺序运行七条入口组合。
- 完成人工验证两阶段暂停恢复。
- 记录同版 CaseDraft 和事实溯源。

退出条件：

- 图片、文件、视频和挑战相关账本项均获得真实重判。

### V2-S4：调度、反向修复、时钟和故障恢复

- 完成三种执行方式。
- 完成失败分类和修复闭环。
- 落地可控时钟。
- 注入 Worker 中断和租约过期。

退出条件：

- 时间和恢复行为可重复。

### V2-S5：30 工具矩阵与安全扫描

- 运行全部工具的成功和失败矩阵。
- 使用假秘密完成全范围扫描。

退出条件：

- 合同数、注册数、Flowise 使用数和运行证据数均为 30。

### V2-S6：72 运行账本收口

- 执行所有连续流程组合。
- 逐条保存证据。
- 重判 74 个等价类。
- 账本生成机器可读 JSON 汇总。

退出条件：

- 无未解释 `FAIL`。
- 无未经批准 `BLOCKED`。
- 无 `NOT_RUN`。

### V2-S7：发布一致性收口

- 重建并通过公共 API 发布 Agentflow。
- 回读 flowId、版本、内容 Hash 和 `deployed=true`。
- 更新 Hash 清单。
- 运行完整测试与 `VERIFY.cmd --no-pause`。

退出条件：

- `I10_PORTABLE_FOLDER_VERIFIED`。

## 6. 测试和验收命令层级

按以下层级执行，上一层失败时停止更高层结论：

```text
L1 语法和单元测试
L2 Agentflow路径与30工具合同
L3 Harness/SQLite/Worker集成
L4 真实控制模型与视觉模型探针
L5 自然语言无图主干
L6 三入口与图片、验证、调度、修复
L7 72运行账本
L8 发布Hash与完整VERIFY
```

任何层失败：

- 保留最后稳定状态；
- 写入安全错误码；
- 不改低门槛；
- 不继续声明更高层通过。

## 7. 最终完成门槛

只有同时满足以下条件，I10 才能从 `NO-GO` 改为 `GO`：

- MiMo/Midscene 真实作者化通过，非 Mock、非 degraded。
- 三入口和图片组合均形成统一 CaseDraft。
- 人工验证真实暂停并恢复同一 taskId。
- Builder、纯 Playwright 和 2×2 全部通过。
- 下载、执行、证书 Hash 一致。
- 挂载和不挂载语义均被真实验证。
- 立即、单次、周期执行均产生可查询终态。
- 反向修复完整走完生成、复验、决定和复跑。
- 30 个 MCP 工具具有真实矩阵证据。
- 可控时钟与租约恢复测试通过。
- 72 个运行组合无未执行项。
- 74 个等价类完成修复后重判。
- 敏感信息扫描在可证明边界内为零。
- Agentflow 公共 API 回读一致且 `deployed=true`。
- 完整 `VERIFY.cmd --no-pause` 返回 `I10_PORTABLE_FOLDER_VERIFIED`。

## 8. 当前公正结论

截至本方案生成时：

```text
代码基础：具备继续修复和验收的条件
Flowise交互主线：已进入真实作者化
当前首要阻断：MiMo/Midscene真实定位失败
连续全链：未通过
全量账本：未通过
正式版结论：NO-GO
```

当前工作提高了可诊断性和验收准备度，但没有形成新的完整产品验收证据，也不能据此提高对“正式版已完成”的判断。
