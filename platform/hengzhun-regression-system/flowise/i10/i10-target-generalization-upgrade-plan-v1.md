# I10 目标系统通用化升级计划 v1

> 定位：本文件是 I10 开发控制文档的专项实施规格。当前代码、SQLite 和真实运行证据决定已实现事实；《衡准-I10-完整链路审计文档》决定完整链路目标。本文件不覆盖现有 I9/I10 历史证据，也不把计划写成已完成能力。

## 1. 决策

衡准的正式目标不是“自动支持所有网站”，而是在声明的支持矩阵内支持任意 HTTP/HTTPS Web 系统。新系统通过目标站点档案、应用能力档案和经确认的执行计划接入；不得因站点名称、URL 路径或页面文字隐式选中复兴银行逻辑。

复兴银行保留为受控演示适配器和兼容回归基线。旧 Runner 在迁移完成前保留为 `LEGACY_COMPAT`，不得删除或作为新 I10 通用任务的默认路径。

## 2. 当前边界清单

| 分类 | 当前位置 | 处理策略 |
| --- | --- | --- |
| 通用主链 | `TargetProfile`、`GENERIC_WEB`、Midscene 定位、Playwright 执行 | 保留并继续增强 |
| 受控复兴门户模板 | `harness/src/i8/script-package-builder.ts` | 迁入显式适配器；禁止名称和路径推断 |
| 固定门户 Worker | `worker/src/login-profile.cjs`、`account-ownership.cjs`、`auth-rejection-recovery.cjs` | 先标记兼容，后迁入适配器 |
| 复兴门户路由/定位器 | `worker/src/i10-midscene-candidate-authoring.cjs`、`i8-formal-runner.cjs`、`i8-stability-runner.cjs` | 从通用分支移除；适配器保留 |
| 演示夹具和知识 | `scripts/i10-stage8-controlled-portal.cjs`、`flowise/i8/knowledge/`、`flowise/i9/knowledge/` | 保留为示例，不作为通用默认知识 |
| 历史 Flowise 生成器 | v2/v3/v4 生成器与制品 | 历史兼容，不再作为正式生成来源 |

`contracts/target-generalization-boundary-v1.json` 和 `scripts/verify-i10-target-boundary.cjs` 是本清单的机器可检验副本。任何新增复兴银行、`/portal/*`、固定客户/转账定位器或旧 Profile 枚举，必须先登记其所有者和迁移阶段。

## 3. 目标模型

四个维度保持独立：

```text
executionEngine       = LEGACY_COMPAT | TARGET_ADAPTER | GENERIC_DYNAMIC
adapterBinding        = 可选，显式 adapterId + version + manifestHash
targetProfile         = 网络、Origin、TLS、重定向、凭据边界
applicationProfile    = 模块、能力、页面事实、验证策略
scriptStatus          = DISCOVERED | VALIDATED | ACTIVE | RETIRED
```

不能使用 `fixtureProfile` 同时表达业务类型、执行引擎和脚本生命周期。

通用能力组固定为：

```text
AUTHENTICATION, NAVIGATION, READ_ONLY_QUERY, FORM_INTERACTION,
TABLE_INTERACTION, FILE_UPLOAD, FILE_DOWNLOAD, BUSINESS_SUBMISSION,
VERIFICATION_GATE, ASSERTION, EVIDENCE_CAPTURE
```

“账户、客户资料、转账、单号查询”是复兴银行适配器的模块实例，不是平台全局枚举。

## 4. 实施阶段

### GZ-00：边界冻结与机器化盘点 — 已完成

- 固化当前复兴银行专属命中、通用主链和历史兼容链。
- 增加边界扫描，阻止未登记的专属硬编码扩散。
- 不改变现有运行行为。

验收：`npm run verify:i10:target-boundary` 通过，且所有命中项均有分类。

完成证据（本机）：边界扫描报告 `I10_TARGET_BOUNDARY_VERIFIED`，已登记 29 个直接命中项；目录级规则覆盖 20 个测试、历史 Flowise 与控制文档命中项。该阶段只建立门禁，不表示 GZ-01 至 GZ-05 的通用化代码已经完成。

### GZ-01：显式适配器选择 — 已完成

- 新增 `adapterBinding`，包含 `adapterId`、`adapterVersion`、`manifestHash`。
- 删除“显示名包含复兴银行/Fuxing 且路径为 `/portal/login`”的隐式模板选择。
- 目标站点确认卡必须明确显示“通用发现模式”或具体适配器；用户确认后才冻结。
- 新 I10 通用任务必须有活动 `TargetProfile`；无目标档案只返回缺口，不回退本机门户。

完成证据（本机）：`adapterBinding` 已进入目标站点档案的冻结载荷和版本化 Hash；只有登记的 `fuxing-bank-demo@1.0.0` 且 Manifest Hash 匹配时，确定性演示模板才可用。相同复兴名称和 `/portal/login` 路径但没有绑定时，经回归测试确认走 `GENERIC_WEB`。Flowise 目标站点确认卡显示 `GENERIC_DYNAMIC` 或 `TARGET_ADAPTER`，且未选择绑定时不会隐式启用演示模板。

### GZ-02：通用执行器去路由硬编码 — 已完成

- 通用 `goto`、`waitForURL`、成功断言只使用冻结的 `TargetProfile`、`ApplicationProfile` 和候选脚本事实。
- 删除通用路径中的 `/portal/dashboard`、`/portal/profile`、`/portal/transfer`、`/portal/orders/query` 回退。
- Midscene 只产生定位建议；Playwright 继续是唯一页面操作执行器。

完成证据（本机）：通用 `waitForURL` 仅校验冻结 TargetProfile 的允许 Origin，不再以 `/portal/dashboard` 等固定路径补全未知目标；正式执行和稳定性执行仅可通过显式适配器加入本地身份服务 Origin。受控旧路径保留在非通用兼容分支。

### GZ-03：应用能力档案 — 已完成

- 新增 `ApplicationProfile`、`ApplicationModule`、`ModuleCapability` 的 SQLite 迁移与合同。
- 模块发现只限用户案例涉及的页面；禁止自动爬取整个内网系统。
- 认证方式、可见浏览器接管、验证策略和支持边界由模块能力档案表达。

完成证据（本机）：迁移 `035_i10_application_profiles.sql` 建立目标站点拥有的应用、模块和能力记录；`target_profile_prepare` 可持久化待确认档案，确认目标站点时与档案一起激活。合同测试已覆盖任意 HTTPS 内网站点的认证、查询、表格交互与证据采集能力组合；核心代码不再以“账户/转账/个人资料”等复兴业务枚举表达新目标系统模块。

### GZ-04：复兴银行适配器化 — 实施中（本机凭据复验待完成）

- 迁移到 `adapters/fuxing-bank-demo/`，由版本化、代码拥有的 Manifest、定位器和验证策略组成。
- 适配器必须 `EXPLICIT_ONLY`，不得根据品牌、路由或自然语言自动命中。
- 旧 Runner 只作为兼容层，迁移后逐步禁止新任务引用。

已完成子项（本机）：复兴银行演示模板、路由和定位器已从通用 `script-package-builder` 迁入 `harness/src/i8/adapters/fuxing-bank-demo.ts`；Worker 的受控定位器与路由已迁入 `worker/src/adapters/fuxing-bank-demo/index.cjs`，U-key 验证策略已迁入 `worker/src/adapters/fuxing-bank-demo/verification-policy.cjs`。三条固定门户执行器（登录资料一致性、账户归属、认证拒绝恢复）也已迁入同一 Worker 适配器目录，旧脚本路径仅保留兼容转发。`worker/src/i10-verification-policy.cjs` 现在是通用策略分发器：只有冻结的 `fuxing-bank-demo@1.0.0` 绑定才会启用该 U-key 行为。Builder 只在冻结绑定通过 Manifest Hash 校验时读取该实现。Worker 的运行时任务装配已改为直接加载受控适配器实现；历史 `worker/src/*.cjs` 仅保留兼容别名。通用正式执行和稳定性执行使用独立的 `i10-worker-utils.cjs`，不再通过受控登录执行器取得通用凭据、Hash 或制品函数。作者化器中旧的全页关键词验证分类函数已删除，验证策略只由冻结适配器绑定分发。`scripts/i10-gz04-adapter-replay-live.cjs` 已分别调用显式适配器模块与历史兼容别名，并只落盘脱敏结果；当前浏览器回放前的密码授权预检得到 `invalid_grant`，记录为 `I10_GZ04_CREDENTIAL_REJECTED`，不写入账号密码、令牌或响应正文。因此代码迁移已完成，但“当前本机受控回放通过”尚未成立：必须由用户通过本机安全凭据页面重新录入一个可登录的客户凭据后重跑该脚本，才可将本阶段标记为完成。

### GZ-05：Flowise 和验收矩阵 — 本机受控范围已完成

- 主控 LLM 只产生意图、能力候选、步骤、预期和缺口；不得生成复兴路由或固定定位器。
- 分别验证复兴适配器、两个中性内网站点和未注册目标站点。
- 未支持的原生窗口、PIN、OTP、验证码、反自动化挑战必须失败关闭并说明能力边界。

实施进度（本机静态/合同与受控运行）：v6 的唯一生成链继承 v5 中受约束的 IntentPlan 提示；主控只能输出 `GENERIC_WEB`，并被明确禁止按系统名称、URL、页面文字或业务语义推断适配器。回归已覆盖“名称和路径均像复兴门户但无绑定”的通用路径。2026-07-29 已在当前 Flowise/MCP/Harness/Worker 运行时完成一次 `GENERIC_WEB` + 截图 OCR 的受控门户回归，生成 `prep_867ed3ce-1d3c-4e65-9ab6-7f3575632d12`、`candidate_60c6f06e5d2bd080110d73e5cd779d967a3a79ae`、`task_1f2915a6-1bc3-4d27-8b6d-bea14818f0cd`，并以 `SUCCEEDED` 终态写入本地证据 `.data/evidence/i10/l2-generic-screenshot/result.json`。它证明未绑定路径可走通通用代码；该证据不得冒充“中性内网站点”验收。随后增加两套本机中立验收夹具，均无 `/portal/*` 路由、无 `fuxing-bank-demo` 绑定：Nova 审批中心通过 `prep_90d1d9e4-0f45-472e-ac08-8f4e17fecb8d`、`candidate_72212ca2a151c0296ad902c24387236b035f5c47`、`task_69a4296b-a9dd-48a6-a134-321927527c16`；Orion 资产服务通过 `prep_431ef569-7448-4974-9f38-aa245f64f16b`、`candidate_65ffc234cd3ce0d547bee0602fbd7ffd43e63391`、`task_b3fce628-a971-437b-aab5-7dbda535df1a`。两条证据分别写入 `.data/evidence/i10/l2-generic-screenshot-neutral-a/result.json` 与 `.data/evidence/i10/l2-generic-screenshot-neutral-b/result.json`，均为真实 Flowise+OCR+Midscene+Playwright+稳定性验证+正式执行结果。另以 Atlas 工单台未注册夹具验证了失败关闭门槛：`targetprofile_42a0954d-7cc1-491a-b6e6-ba9263ec575f` 处于 `PENDING_CONFIRMATION`、`adapterBinding=null`、作者化计划数为 0，证据为 `.data/evidence/i10/gz05-unregistered-target/result.json`。这些均是本机受控夹具；它们证明架构通用性，不得外推为已获授权的内网真实站点验收。真实内网接入仍须由后续办公环境按目标授权、凭据与网络边界复验。

## 5. 完成门槛

- 新 I10 任务不会因名称、URL 或页面文字自动进入复兴银行模板。
- 通用候选脚本中没有 `/portal/*`、`customer-profile-*`、`transfer-*` 等复兴专属值。
- 复兴专属值只允许存在于明确登记的适配器、历史兼容、演示夹具、测试或示例知识中。
- 新 HTTP/HTTPS 系统可仅通过目标档案和应用能力档案进入作者化及验证，无需修改核心 Harness、MCP、Worker 或 Flowise 代码。
- 复兴银行兼容回归与中性站点回归均通过。
