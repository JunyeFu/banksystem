---
id: RF-045-S1
title: CLI browser execution through MCP Harness and Worker
document_type: task
domain: architecture
status: EVIDENCED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-045-S1：CLI 真实浏览器执行入口

## 业务目标

测试工程师对已精确批准的 Journey 执行一次显式 `journey execute`，可观察到同一 Journey 经 MCP、Harness 和 Worker 进入正式 Run。

## 输入与输出

- 输入：`journeyId`、绑定 `sessionId`、Harness 当前已批准状态。
- 输出：Journey、Run、Task、Candidate 的权威 ID 和 `QUEUED|RUNNING|PASSED|FAILED|BLOCKED`。
- 依赖：MCP、Harness、Worker、Playwright/Midscene、银行页面和已登记凭据引用。

## 实现

- 新增 `hz-agent journey execute <journeyId> --session <sessionId> --jsonl`。
- `journey author` 对受控银行目标使用显式 `--adapter fuxing-bank-demo`；非法值直接失败，省略时保持通用目标，不按系统名、URL 或模型文本推断。
- 使用已精确批准 Journey 中冻结的站点、入口和凭据引用，经 MCP 推进 `target_profile_prepare -> target_profile_decision_submit -> case_prepare -> authoring_submit -> candidate_compile -> candidate_decide -> execution decision -> run_submit -> task_get`。
- 每个写入后回读 Harness；任一意外阶段或错误立即失败，不重试、不切换模型。
- Harness 业务错误以安全原始错误码和退出码 `4` 返回，不得改写为 `UNEXPECTED_FAILURE`。
- MCP 的 Journey 输入与决策写工具返回同一有界投影，避免 Harness 已提交后被输出预算误报为失败；Controller 从真实 `candidateVersion` 建立写入版本栅栏。
- 唯一模型作者化调用使用固定 90 秒截止时间且重试次数为零；超时必须返回明确模型错误并停止。
- CLI 只通过 MCP；Worker 从 Harness 领取任务并操作页面。
- Authoring、稳定性认证和正式执行共用同一浏览器请求来源白名单；只有冻结的注册适配器可以加入银行身份提供方来源。
- 人民币可见事实映射到页面实际 `CNY`，纯“定位”描述编译为只读 `expectVisible`，不得误编译为点击。
- 根 Windows 11 生命周期在 Windows PowerShell 5.1 下使用受支持的 HTTP、原子文件、平台、原生命令、哈希与随机数 API；不增加重试或备用路径。

## 项目易错点

- 案例批准不等于脚本激活或 Run 完成。
- `run_submit` 必须绑定 Harness 产生的 `confirmedDecisionEventId`。
- Candidate/Run/Task ID 不得由 CLI 生成或按“最新”推测。
- Worker 返回失败时不得伪装为成功退出。
- 未形成凭据与 `ACTIVE TargetProfile` 的双向绑定时不得伪造 `authoringContext`。
- “至少存在一个人民币账户及对应的可用余额”必须锚定末尾业务名词“可用余额”，不得把“页面上是否至少”当作 Midscene 定位词。
- “进入账户概览或账户列表页面”是显式只读导航二选一，视觉定位与 Playwright 证据必须接受任一实际渲染标签，不能把整段二选一文本当作按钮名；写操作不适用该规则。
- 登录页由启动地址重定向得到时，`waitForURL` 必须与配对点击前的实际 URL 比较；没有配对点击时以当前页面为基线，不能与静态 `LAUNCH_URL` 比较后提前通过。
- Candidate 的 `VALIDATION_FAILED` 或稳定性批次 `FAILED` 必须投影准确错误与批次 ID；不得让 CLI 继续轮询并以总超时掩盖根因。
- 只把适配器写进模型草案不构成授权；CLI 显式选项必须作为结构化 Journey 输入由 Harness 冻结并解析为登记版本与清单 Hash。

## 验证

- CONTRACT：命令语法、固定 MCP 序列、Harness 回读与退出码。
- INTEGRATION：真实 MCP 传输 + 隔离 Harness 测试投影 + Worker 状态投影，校验 Journey/Run/Task/Decision 连续。
- RUNTIME_ACCEPTANCE：Fresh Harness + 实际 Worker + Playwright/Midscene 浏览器，校验同一 ID 链和真实页面结果；必须单独授权后执行。
- LIVE_E2E：本批不执行；留给 A06 的新 ReleaseIdentity 正式清单。

## 完成门

CLI 合同、隔离集成和实际 Worker 浏览器运行门均已通过；同一新身份下的 Journey、Candidate、Run、Task、Decision 和 Artifact ID 连续一致。RF-045/A05-M03-S01 关闭；CLI 面向用户的完整运行证据投影仍是 A05-M03-S02 的显式后续门。

## 当前运行门状态（2026-09-04）

- ReleaseIdentity `7ba381c4c026705346cb644175fbfb7064a54123ef95cb6677633b885f4e3a74` 在 Windows PowerShell 5.1 下连续两次冻结一致；`prepare`、`up`、状态、真实门户登录和六步 `doctor` 全部通过。
- 注册测试 631/631；生命周期、架构治理、文档和 diff 门通过。
- 真实模型 author 生成 3 步/3 断言，validate 与精确 approve 通过；Candidate 稳定性 4/4，正式 Run PASSED，Worker Task 首次尝试 SUCCEEDED，8/8 正式断言通过。
- 三个运行工件的实际字节、登记大小和 SHA-256 全部一致；冻结 DSL 与 Run 窗口数据库核验均证明银行业务写入为 0。
- 结果见 `agent/runs/rf045/20260904-midscene-anchor-repair/runtime-result.json`；服务已停止、卷已保留、七个目标监听端口为零。下一门是 A05-M03-S02 CLI 完整运行证据投影，不是 Full18 或发布裁决。
