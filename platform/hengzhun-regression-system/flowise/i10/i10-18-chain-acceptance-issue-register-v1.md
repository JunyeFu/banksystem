# I10：18 条双路径验收问题清单

状态：持续更新中  
范围：9 个业务案例 × 无截图 / 截图 OCR 两条完整链路，共 18 条。  
事实边界：本清单只记录本机真实运行、日志、代码与测试已证实的情况；静态测试通过不等于 18 条端到端验收通过。

## 1. 验收口径

每条记录必须完成下列链路后才可标记为“端到端通过”：

```text
自然语言（可附截图）
→ Flowise 分类、结构化和缺口收集
→ 本机 DPAPI credentialRef 绑定
→ TargetProfile 与案例确认
→ Midscene 定位
→ Playwright 执行器动作与脚本生成
→ 纯 Playwright 验证
→ I10 2×2 稳定性证书
→ 用户激活/不激活选择
→ 即时、单次或周期执行
→ 结果收件箱与证据摘要
```

截图链额外要求：受控附件上传 → 本地 OCR → 主控筛选案例事实 → 用户确认 → 原图按策略清理。OCR 只能补充事实，不能改变用户业务意图。

当前总状态：**18 条端到端验收已于 2026-08-01 在第四身份 `0bc0b86d` 下完成：18/18 记录 PASSED、9/9 配对 SEMANTIC_MATCH、账本 currentPassed=20（含 2 条配对补考记录）、checkpoints=0、ACTIVE 调度=0、验证套件 233/233。`I10_FLOWISE_18_CHAIN_ACCEPTED` 仍未写入——四门槛标记尚无受控写入机制，且 I10-GAP-001/008/009/011 证据未齐。**

## 2. 已解决并有回归覆盖的问题

| 编号 | 问题与影响 | 根因 | 已落地修复 | 验证状态 |
|---|---|---|---|---|
| I10-ISS-001 | 登录案例被静态“移动证书”文案反复判定为人工验证，形成 Flowise 循环。 | Worker 每一步扫描整页 `body.innerText()`，只按关键词判断挑战。 | 引入 `VerificationPolicyV2`；普通登录为 `NONE`；验证仅在明确业务动作、路由/DOM/业务证据同时满足时触发。 | 单元与策略回归已覆盖；全链待复验。 |
| I10-ISS-002 | headless Chromium 要求用户完成浏览器内验证，用户实际上无法接管同一会话。 | Flowise 人工确认被错误当成浏览器交互。 | 增加可见接管规则、`I10_VISIBLE_BROWSER_HANDOFF_UNAVAILABLE` 和确认后页面结果复核。 | 代码与局部测试已覆盖；真实桌面接管待验收。 |
| I10-ISS-003 | Midscene 既定位又点击，职责边界不清，难以审计。 | 作者化与执行器职责混合。 | Midscene 只产生定位/观察证据；Playwright 负责点击、输入、断言和取证。 | Worker/Builder 回归已覆盖。 |
| I10-ISS-004 | 凭据被误列为业务缺口，用户被诱导在 Flowise 对话输入账号密码。 | 草案缺口与安全凭据状态没有统一。 | 通过本机 DPAPI 表单保存；Flowise/LLM/脚本只传 `credentialRef`。 | 凭据与泄漏扫描测试已覆盖。 |
| I10-ISS-005 | 缺 URL、缺凭据时过早调用 `target_profile_prepare`，得到泛化 `MCP_PROTOCOL_ERROR`。 | 规范化节点直连目标站点准备，缺少前置门槛。 | Journey → needs-input/credential → TargetProfile prerequisite 顺序已加入；MCP 追加字段级错误码。 | 静态路径测试通过；人工恢复路径仍待回归。 |
| I10-ISS-006 | Flowise 的 `proceed/reject` 被解释为默认选择 `allowedActions[0]`。 | Flowise 只有二选一 Human Input，Harness 返回多业务选项。 | 增加 `STATUS_ONLY`、`INPUT_REQUIRED`、`CONFIRM_EXACT` 合同；最终确认冻结唯一提案。 | 交互合同测试通过。 |
| I10-ISS-007 | 用户看见大段原始 JSON、内部字段和错误链，无法判断下一步。 | LLM 原始输出直接回复。 | 简报优先；完整 CaseDraft/ActionTrace/诊断转入制品。 | 生成图已调整；实际聊天展示待验收。 |
| I10-ISS-008 | 文件与视频入口缺少统一案例模型，无法和自然语言入口共用后续流程。 | 三条入口各自生成不同中间对象。 | 建立 `InputEnvelope` / `CaseDraft` / 导入状态机；支持 XLSX、CSV、DOCX、JSON 与 MP4/H.264 边界。 | API、OCR 与导入局部测试通过。 |
| I10-ISS-009 | 图片链将视觉 LLM 与 OCR 重复耦合，输出难读、成本和上下文不稳定。 | 早期方案把 OCR、视觉模型和主控同时作为事实源。 | 权威链调整为纯 OCR → 主控事实筛选 → 用户确认 → 删除原图。 | OCR 专项测试通过；18 条图片链待验收。 |
| I10-ISS-010 | 旧服务仍加载旧图、旧 MCP、旧 Worker，健康检查却显示正常。 | 健康检查只看 HTTP 与 SQLite quick-check。 | `/health`、`START/STATUS` 现同时检查期望/实际迁移版本、已发布流程状态、Flowise 图 Hash 及 Worker 代码版本；任一漂移均不得显示业务就绪。 | 已在本轮重启后实测：Harness、MCP、Worker、Flowise 全部为受管当前进程，`businessReadiness=READY`；仍需纳入最终全量验收。 |
| I10-ISS-011 | Flowise 发布清单与数据库/导出图状态不一致。 | 发布过程没有三方内容 Hash 回读。 | 发布后回读 Flow ID、部署状态、源图与部署图 Hash；不一致失败关闭。 | 当前发布探针已通过。 |
| I10-ISS-012 | U 盾网页验证没有区分“已直接进入单号页”和“真实验证页”。 | 验证检测不具备动作边界与页面状态判断。 | 转账首次确认后：单号页直接跳过；验证页进行三次独立观察；网页按钮由 Playwright 点击；三次失败才进入人工接管。 | 策略与尝试记录测试通过；银行门户真实转账全链待验收。 |
| I10-ISS-013 | 凭据保存后发送“继续”会再次发起大载荷案例结构化，曾导致 LLM `terminated`。 | 凭据回流未复用已存 `credentialRef`，缺口被重复计算。 | v5/v6 将凭据回流改为注入已存 `credentialRef` 后重新计算缺口；无有效草案才走紧凑兜底结构化。 | 运行态复验通过：第四身份 18 链全部经凭据回流恢复草案（2026-08-01）。 |
| I10-ISS-014 | Flowise 模板将数组参数转换为字符串，`authoring_submit` 在 MCP 参数校验阶段失败。 | 数组边界只接受原生数组，不接受编码字符串。 | MCP 数组边界兼容数组/编码字符串；作者化提交从 Harness 冻结 CaseDraft 读取步骤和断言，不再依赖 Flowise 并行数组。 | 运行态复验通过：18 链全部获得 `preparationId` 并到终态（2026-08-01）。 |
| I10-ISS-015 | 原生结构化 LLM 偶发输出截断 JSON，Flowise 直接终止整张图。 | 提示词载荷过大且 credentialRef 对模型可见。 | 缩短 `controllerPromptEnvelopeV1`、限制输入字段、移除 credentialRef 对模型的可见标识；失败旅程保留恢复状态。 | 运行态复验通过：18 链结构化全部完成（2026-08-01）。 |
| I10-ISS-016 | 自定义节点的数组输出在 Flowise 中发生隐式字符串化。 | 跨节点并行数组传递不受 Flowise 模板支持。 | 由 CaseDraft 权威读回替代跨节点并行数组传递；保留严格 Harness 验证。 | 运行态复验通过：18 链无 `I8_INTENT_*` 参数错误（2026-08-01）。 |
| I10-ISS-019 | 过期人工验证或长期 `PROCESSING_AUTHORING` 旅程会保留在运行态，导致下一次验收无法判断是否可恢复。 | 定时清理只处理图片导入，未对挑战和作者化作业进行状态收敛。 | 新增运行态协调：过期挑战原子转为 `EXPIRED` 并追加不可变事件；仍存在可领取候选作业的作者化旅程重排队；无可恢复绑定的旅程以 `I10_AUTHORING_ORPHANED` 失败关闭并提供重试动作。 | 2 项定向回归通过；真实 Worker 中断恢复待验收。 |
| I10-ISS-020 | 受控 L1 浏览器夹具复用固定端口时，新凭据可能被写入到仍在运行的旧门户会话，登录失败会被误诊为视觉定位失败。 | `i10-l1-live-bootstrap` 固定使用 28884，未把“已有受控门户”和“本轮凭据”作为同一隔离单元处理。 | 引导脚本支持显式 `I10_STAGE8_PORT`，每轮使用未占用端口；不终止未知进程。 | 已用独立端口 28885 实测完成候选作者化、纯 Playwright 与 2×2 证书；仍待纳入正式 L1 账本。 |
| I10-ISS-021 | H1/H3 变体草案断言措辞丢必需标记（H1 图片丢“确认”、H3 文本丢“受理状态”），配对门禁按设计判 `SEMANTIC_MISMATCH`；H1 图片的 RECURRING 调度曾两次触发，验收后已停用。 | 主控对自然语言钉死断言的遵循是非确定性的，单轮措辞不可依赖。 | 验收自然语言显式钉死断言句式 + attempt≥2 配对补考机制（仅当终稿 PASSED 但配对 MISMATCH 才允许更高 attempt，上限 5）；不放宽门禁、不手改记录。 | H1 图片 attempt 2（`acceptance_f54603b6`）与 H3 文本 attempt 2（`acceptance_ec5a147e`）语义含钉死断言；9/9 SEMANTIC_MATCH（2026-08-01）。 |
| I10-ISS-022 | 配对补考记录入账后门禁仍判 MISMATCH：H1 图片 attempt 2、H3 文本 attempt 2 语义已对齐却被无视，两次重跑均以 FAILED 退出并多写一个矛盾 checkpoint。 | 驱动 `recordKey(caseId, variant)` 把 attempt 硬编码为 1，`latestComparableRecord` 的 1..8 循环每次读到同一条 attempt-1 记录。 | 签名改为 `recordKey(caseId, variant, attempt = 1)` 透传；回归测试用字面键搭夹具（用被测 helper 搭夹具会掩盖该 bug）。 | 修复后 status 复算即 9/9 SEMANTIC_MATCH；`i10-18-chain-acceptance.test.cjs` 14 项、全套件 233 项通过（2026-08-01）。 |

## 3. 已修复但尚未完成运行态复验的问题

| 编号 | 问题与影响 | 已落地修复 | 仍需的真实证据 | 状态 |
|---|---|---|---|---|
| I10-ISS-017 | 失败诊断只保留 `I8_CANDIDATE_BUILD_FAILED`，无法说明失败动作和恢复方法。 | 新增脱敏诊断字段：失败阶段、动作序号、页面指纹、模型状态、挑战状态与诊断 Artifact。 | 注入定位器失败后，Flowise 对话与 Artifact 均可读到同一诊断。 | 待验收 |
| I10-ISS-018 | 反向修复可能在失败后被自动重试，污染验收账本。 | 作者化失败重试改为显式 Human Input；正向路径禁止隐式 `proceed` 重试。 | 反向案例产生失败分类 → 修复候选 → 重新验证 → 用户确认 → 复跑证据。 | 待验收 |

## 3.1 本轮（2026-07-31 第三身份 `60765834`）已修通并实证的链路缺陷

| 类别 | 缺陷与修复 | 证据 |
|---|---|---|
| 业务输入 | `INITIAL_CASE_INPUT` 跨会话提交链缺失（H 链 NEEDS_INPUT 无提交路径）：新增 decision_parse 确定性解析、`journey_input_submit` 节点与驱动补充器。 | H1:TEXT_ONLY 全链 PASSED，`acceptance_616cac76`。 |
| 键名 | 补充草案须用 `businessInputs` 键并同时清 `missingFields:[]`；`compactJourneyForFlowise` caseDraft 投影与 `normalizeI10NaturalDraft` 透传（真根因）。 | `case_74c2254f` 前例对照、H1 案例含完整业务输入。 |
| 暂断 | `predict` 对"空内容/terminated"类模型端故障有界重试（探针实测同提示词 2-3k token 完成，非预算问题）；预览未就绪容忍扩至 `I8_STABILITY_CERTIFICATE_REQUIRED`。 | H3 文本、H2/H3 图片 recover 后 PASSED。 |
| 终稿 | 快认证竞争时作者化证据/证书引用不到达转录：改为 SQLite 权威兜底（`i10_action_traces`、`i8_stability_certificates`）；HIGH 类 `targetProfileId` 改从凭据 ACTIVE 绑定查询。 | H1 文本/H2 图片/H3 图片记录。 |
| 终态判定 | COMPLETED 旅程不被投影调和致 schedule_create 幂等空转：驱动识别调度负载直接终局（结构化匹配防转义绕过）；`deferCandidateEvidenceCheck` 避免会话内断言误伤快认证。 | `schedule_8d32203b`/`schedule_b084badc` 等创建-触发-收件箱 PASSED。 |
| 结果查询 | `result_inbox`/`schedule_disable` 双入边 JOIN 死锁：构建器单入边克隆链修复。 | `awaitScheduledResult` 与停用管理会话均成功。 |

## 3.2 本轮（2026-08-01 第四身份 `0bc0b86d`）已修通并实证的链路缺陷

| 类别 | 缺陷与修复 | 证据 |
|---|---|---|
| 结构化预算 | 结构化动作上限 4→6（`build-i10-agentflow-v5.cjs` 与 `mcp/src/server.cjs` 的 `steps.slice` 同步调整），H 链草案不再被截断为 4 步；注意 v6 构建器只读 v5 产物不执行 v5 构建，改 v5 必须先单独跑 v5 构建器再跑 v7。 | 第四身份重建 v7 并发布，18/18 记录 PASSED。 |
| 配对评估 | `recordKey` 吞 attempt 致配对门禁只读 attempt-1（I10-ISS-022），签名透传修复。 | 修复后 `status` 复算即 9/9 SEMANTIC_MATCH，无需再跑链。 |
| 矛盾检查点 | 终稿入账后配对失败路径再写 FAILED_RECOVERABLE checkpoint，与同键 PASSED 记录矛盾（账本注释早已命名此矛盾但无清扫机制）：新增 `sweep-contradictions` 子命令，仅清同键且当前身份 PASSED 的项，未入账的待恢复 checkpoint 一律不动。 | swept 5、remaining 0；纯函数选择规则有回归测试。 |
| 调度卫生 | 全量重跑后 ACTIVE 调度复算为 0，无新生 RECURRING 泄漏。 | `schedules WHERE status='ACTIVE'` → 0 行（2026-08-01）。 |
| 全量复跑 | 第四身份下 18 条全部重跑入账 + 2 条配对补考（H1 图片 attempt 2、H3 文本 attempt 2），配对 9/9 SEMANTIC_MATCH。 | 账本 currentPassed=20、checkpoints=0；验证套件 233/233。 |

## 4. 尚未解决或尚未验收的缺口

| 编号 | 类别 | 缺口/问题 | 影响 | 下一步验收或修复动作 |
|---|---|---|---|---|
| I10-GAP-001 | 全链 | 第 4 条反向链目前未越过“案例冻结确认 → 作者化提交”运行门槛。 | 不能证明反向修复闭环。 | 复跑该单条 Stage8；确认 `AWAITING_STAGE3`、候选、失败分类、修复、2×2 与复跑。 |
| ~~I10-GAP-002~~ | 全链 | **已闭环（2026-08-01 第四身份 `0bc0b86d`）**：18/18 记录 PASSED、9/9 配对 SEMANTIC_MATCH、currentPassed=20（含 2 条配对补考）、checkpoints=0、ACTIVE 调度=0。 | — | — |
| I10-GAP-003 | 输入 | Flowise 聊天中的附件上传、粘贴板图片、OCR 进度与结果折叠在不同运行图版本中曾不一致。 | 人类验收体验不稳定。 | 在当前发布图中验证文件上传、图片附件、OCR 状态、事实确认与原图清理。 |
| I10-GAP-004 | 泛化 | 任意 HTTP/HTTPS TargetProfile 的静态边界存在，但不同内网站点的真实 E2E 尚无证据。 | 尚不能声明“任意网站”已经可用。 | 使用无复兴银行适配器绑定的中性站点夹具跑完整通用链。 |
| I10-GAP-005 | 被测系统 | L3 消息、M1 交易、M2 收款人、H1-H3 转账依赖的本地场景夹具、筛选功能、验证页和单号查询页需要逐项实证。 | 中/重度案例可能阻塞在业务夹具，而不是衡准。 | 每例先运行幂等 scenario provision，再做门户/API 预检。**部分缓解：18 链在第四身份下已全量实证通过（2026-08-01）。** |
| I10-GAP-006 | U盾 | “办公电脑中持久化 U 盾可直接确认”的网页路径尚未在本机/办公机完整验证。 | H2/H3 不能证明自动验证或正确人工接管。 | 分别验证直达单号页、网页按钮自动确认、三次失败后可见接管三分支。**部分缓解：H2/H3 双变体已 PASSED，但具体走了哪条分支未复核。** |
| I10-GAP-007 | 调度 | ON_DEMAND、ONE_TIME、RECURRING 有代码和局部测试，但未形成三种成功运行的当前版本收件箱证据。 | 定时回归不能验收。 | 使用同一已持证脚本，分别创建、查询、停用/恢复并核对结果。**部分缓解：ONE_TIME 与 RECURRING 在第四身份 18 链中真实创建并触发，验收后已停用（ACTIVE=0）。** |
| I10-GAP-008 | 修复 | 数据库中尚未形成修复候选、修复证书、激活和复跑的完整真实链。 | 反向流程仍是设计/局部能力。 | 受控定位器变更注入后完成一次不可伪造的链路。 |
| I10-GAP-009 | 便携性 | 第二台 Windows 电脑验收尚未完成。 | 只能称“本机发布候选”，不能称任何 Windows 电脑可直接运行。 | 本机 18 条通过后再执行办公电脑迁移矩阵。 |
| I10-GAP-010 | 文档 | 历史文档中仍可能有旧的“视觉模型并行 OCR”“PREPARE 已迁移数据库”等表述。 | 误导实施与验收。 | 以本清单、I10 开发顺序和运行代码为准逐文档校准。 |
| I10-GAP-011 | 运行态恢复 | 虽然状态协调逻辑已落地，但尚未在真实的 Worker 中断、模型超时和可见验证接管三种情形下形成端到端证据。 | 不能以单元测试替代恢复承诺。 | 在当前代码启动后的单案例链中分别注入三种可控中断，核对旅程、作业、挑战和收件箱终态。 |
| I10-GAP-012 | 门槛标记 | `I10_FLOWISE_18_CHAIN_ACCEPTED` 等四个门槛标记当前没有受控写入机制（只能手写状态，违反证据纪律）。 | 18 链完成后仍无法按流程声明里程碑。 | 设计并实现由账本复算驱动的门槛标记写入命令（读 status 输出、绑定 identityHash、写入可审计标记文件）。 |

## 5. 非阻断但必须保留的兼容性边界

| 编号 | 边界 | 结论 |
|---|---|---|
| I10-NB-001 | Flowise 原生 Human Input 只有 `proceed/reject`。 | 不改 Flowise 前端；Agent 必须明确说明反馈填写位置、继续与拒绝的本次作用。 |
| I10-NB-002 | HiAgent 与 Flowise 节点名称、导入格式、管理 API 不同。 | 保留 Flowise 导出图作本机实现；迁移时映射为 HiAgent Skill、MCP 插件和工作流节点，不阻断本机验证。 |
| I10-NB-003 | Midscene/Playwright 只能可靠操作网页 DOM。 | 原生 U 盾 PIN 窗口、系统级 OTP 窗口不由本项目自动操作；网页持久化确认按钮可以走现有策略。 |
| I10-NB-004 | 通用化不等于自动猜测系统适配器。 | TargetProfile 默认 `GENERIC_WEB`；只有用户/管理端显式注册的适配器才可使用专属模板。 |

## 6. 当前执行顺序

1. 反向修复链（I10-GAP-001/008）与三类可控中断注入（I10-GAP-011）补齐端到端证据。
2. 实现四门槛标记的受控写入机制（I10-GAP-012），再由账本复算驱动写入 `I10_FLOWISE_18_CHAIN_ACCEPTED`。
3. 复核 H2 U 盾实际分支证据（I10-GAP-006）与三种调度模式的当前版本收件箱（I10-GAP-007）。
4. 第二台 Windows 电脑便携验证（I10-GAP-009）。
5. 最后刷新 Hash 清单并运行 `VERIFY.cmd --no-pause`；该结果只能证明导出包完整，不替代运行验收。
