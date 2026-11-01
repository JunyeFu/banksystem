---
id: DOC-ARCH-RF057-A01-ROOT-REPAIR-001
title: RF-057 A01 根因与修复方案
document_type: reference
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# RF-057 A01：根因与修复方案

实施更新（2026-09-28）：用户随后以“落盘修复”批准源码修复及控制链细化。R1–R4 已实现，R5 非运行身份计算已完成；结果与未完成 LIVE 门见 [修复落地记录](repair-implementation-a01-001.md)。以下诊断、旧白名单/预算和“未修改”描述保留为当时状态，不代表当前实施状态；当前可写范围以已细化的 batch/S2/backlog 为准。真实 BYOK A01 仍须新身份授权，不由本更新授予。

## 结论与边界

本次首个失败的根因是**作者化编译器将统一身份认证错误降解为当前页面上的账号密码表单操作**。不是 Docker、银行账务或模型端点不可用；也不是旧 `login-username` 选择器直接导致了这次失败。旧适配器的失配是另一个必须同步修复的已确认缺陷。

本文件记录只读诊断和待实施修法，不授予产品代码修改或下一次 LIVE 执行权限。唯一实施顺序仍是 `agent/plans/active/v54-implementation-batches.md`，任务状态仍是 `agent/backlog.yaml`。修复应归入既有 RF-057-S2，不另建并行路线；当前 S2 未完成、S3/S4 未解锁。

源码权威：`D:\Agent\banksystem`，`main@552b3b8ac517bd5991bff446e72d9f4e87ea9543`，保留已有脏工作区。

已授权的失败身份：`ec1748f2d374ac27fff718a04e57c11d667659dbd22c62154b691cc7563a2f3d`。

## 一、已确认的因果链

失败运行：`676a0814-11df-4460-8c9e-8da6921d9259`。

- Journey：`journey_27a00e99-ae9b-4906-845d-f2ab54758f49`；公共回读为版本 6、`FAILED_ACTIONABLE / FAILED`、`I10_MIDSCENE_TARGET_NOT_FOUND`。
- Preparation：`prep_59104961-c09b-4aa5-90ae-bb95467946d0`，作者化回读 `AWAITING_STAGE3`。
- Build job：`buildjob_d5c50cf7-c95a-4b91-a049-f2eaae906db3`，候选回读为 `FAILED / I10_MIDSCENE_TARGET_NOT_FOUND`。
- Case：`case_ee5348d8-b1fa-4d54-84d1-0175a517f2cb`；持久化第一步包含登录与统一身份认证语义，`adapterSelection=fuxing-bank-demo`。

只提取既有结构化诊断中的 action ID、目标编号、阶段、路径、尝试编号和错误码；不输出模型响应、页面文本、凭据或原始日志：

| 时间 UTC | 动作/目标 | 路径 | 结果 |
|---|---|---|---|
| 08:20:52.346 | `act_01_b0ec2890804bddd25c28` / goto | `/portal/login` | `ACTION_EXECUTED` |
| 08:20:54.863 | `act_02_83daa72761b25c99c80d` / `DYNAMIC_002` | `/portal/login` | 第一次定位得到响应，但 `TARGET_VALIDATION` 失败 |
| 08:21:02.077 | 同一目标 | `/portal/login` | 第二次 `TARGET_LOCATION / I10_MIDSCENE_TARGET_NOT_FOUND` |
| 08:21:07.691 | 同一目标 | `/portal/login` | 第三次同样失败；任务终止 |

实际门户的无交互 DOM 诊断（未填写表单、未点击 SSO、未调用模型）证明：`login-sso-submit=1`，`login-username=0`、`login-password=0`、`login-submit=0`，密码输入框及 `#username` 均为 0。

现有编译器 `harness/src/i8/script-package-builder.ts` 的 `loginSeedIndex → loginCluster → source` 分支不区分登录机制，将认证步骤替换成固定五步：`goto → fill(username) → fill(password) → click(login) → waitForURL`。在当前构建代码上，用同一真实 TargetProfile、明确的 Keycloak 统一身份认证意图执行纯函数编译（不写 SQLite、不构建候选、不调用模型），得到第二步 `fill / DYNAMIC_002 / CREDENTIAL.USERNAME`。这是 CONTRACT 机制复现，不是第二次 LIVE。

因此：正确的 SSO 业务意图在 Harness 编译边界丢失；Worker 被要求在不含账号框的门户登录页定位账号输入框；视觉定位不可能完成规定动作。增加重试、扩大模型预算、换模型、重新播种或修改银行页面均不能修复这个确定性矛盾。

## 二、相关缺陷逐项归属

| 编号 | 已确认来源 | 影响及修法 |
|---|---|---|
| RC-01，P0 | `harness/src/i8/script-package-builder.ts` 的单表单认证展开 | 本次直接根因。按已冻结、版本化的银行认证绑定生成 PKCE 步骤；保留用户业务步骤，不能让模型临时发明认证路径。 |
| RC-02，P0 | `harness/src/i10/service.ts` 创建 TargetProfile 时将三类 origins 均收敛到 launch origin；`worker/src/i10-worker-utils.cjs` 又为银行适配器隐式添加 Keycloak 运行时源 | 已查询到 profile `targetprofile_3bc30749-f17c-4bd9-9caf-68fd9bd73261`，版本 2，navigation/interaction/credential origins 都只有 `http://127.0.0.1:18082`。辅助函数虽允许请求 `19000`，冻结档案与执行边界仍不一致。必须显式冻结门户、Keycloak 和凭据输入源，删除对该受控源的隐式补充。此项尚未成为本次首个错误，不能称为已发生的网络阻断。 |
| RC-03，P0 | Harness 银行动作模板和 Worker 银行适配器仍引用 `login-username/login-password/login-submit` | 这些控件在真实门户不存在，旧登录/身份/转账受控路径也不能被 PKCE-only 产品复用。共享同一个版本化银行认证动作定义，让作者化、稳定性验证和正式执行使用相同登录语义；删除产品路径上的旧密码登录，不增加旧页面回退。 |
| RC-04，P1 | `scripts/test/rf057-agent.mjs` 用 `assert.equal` 包装 CLI 失败，再优先保存 `error.code`，因此业务码被 `ERR_ASSERTION` 覆盖；最外层 catch 仅设置退出码 | 本次报告不能独立定位失败。保留受控 CLI `messageCode`、exit code、阶段及可回读的对象 ID；只允许安全码和元数据，不复制 stdout/stderr、错误堆栈或模型文本。doctor/初始化失败同样必须形成失败终态报告，不伪装成功。 |
| RC-05，P1 | `harness/src/quality-read-model.ts` 的 `cases()` 无分页；`harness/src/server.ts` 对整个列表应用 L1；前端 `qualityApi.cases()` 期待完整数组 | 实际 GET `/api/quality/v1/cases` 为 HTTP 413，`OUTPUT_BUDGET_EXCEEDED`，115,442 字节超过 16,384 字节。不是 A01 的触发原因，却会阻塞后续质量门户验收。增加只读分页及服务端过滤，前端按页读取；不能提高全局预算、静默截断或删除历史用例。 |

代码级安全边界：当前 generic authoring 的 `resolveCredentialValueForLocatedInput` 依据输入控件类型决定账号/密码，但未独立按 `credentialOrigins` 限定填写源。认证修复必须在凭据填写处执行冻结凭据源检查；navigation 许可不能自动授予凭据填写许可。这不是泛化防御，而是现有凭据隔离不变量的落实。

## 三、修复细化：五个顺序小任务

以下为待批准范围。每个小任务先补行为失败测试，再实现，不添加备用模型、宽泛 retry、运行时 Mock、兼容控制面或新数据库。

### R1：失败报告保留真实业务原因

业务目标：执行者在第一次失败时看到真实失败边界，后续场景不执行。

输入/输出：现有 CLI JSONL 终态 → RF-057 报告中的安全错误码、exit code、阶段、Session/Journey ID。

微观步骤：

1. 提取当前 driver 的受控终态判定，给“CLI exit 4 + `I10_MIDSCENE_TARGET_NOT_FOUND`”写行为测试，先证明报告会丢失原因。
2. 显式创建只含安全业务码的测试错误，保留错误来源与对象 ID；断言失败仍表示测试器自己的不变量失败。
3. 将 doctor/凭据准备/执行阶段失败统一纳入本轮 report 终态；停止后续 case，仍执行身份清理，不停止服务。

完成门：CONTRACT 测试能分别证明业务失败码不被 `ERR_ASSERTION` 覆盖、初始化失败有 FAILED 报告、成功必须有真实终态；日志中无凭据。

### R2：冻结真实银行认证合同与权限源

业务目标：浏览器可进入真实 Keycloak 登录页，且凭据只能在本银行身份源填写。

微观步骤：

1. 在既有 `fuxing-bank-demo` 注册合同中声明本产品的 PKCE 认证流程：门户 SSO 入口、Keycloak issuer/realm、回调、成功后页面条件和非秘密选择器；不增加未来 IdP 工厂。
2. Harness 对明确选择此适配器的 TargetProfile 冻结该绑定及三类 origins，版本递增，绑定进入现有 profileHash/ReleaseIdentity；不能按 URL 或名称猜测适配器。
3. 凭据源为声明的 Keycloak 源；门户仍是银行业务源。任意其他已允许的导航源也不得接收凭据。
4. Worker 使用该冻结合同，不再通过 `targetRuntimeAllowedOrigins` 临时补充未冻结的源。对旧 ACTIVE profile 使用公开 prepare/decision 生命周期创建新版本，不写数据库补丁，不把旧记录改写成通过。

完成门：CONTRACT 证明真实认证源一致、错误源零 credential fill、已认证回跳到门户；已有无适配器 generic 目标不继承银行源。

### R3：替换账号表单假设，贯通作者化与正式执行

业务目标：客户通过 PKCE 登录后查看真实账户，而非在门户页寻找不存在的表单。

微观步骤：

1. 针对已确认银行认证绑定生成最小顺序：门户 goto → SSO click → Keycloak 页面就绪 → username fill → password fill → Keycloak submit → 门户已认证就绪。
2. 用一个银行认证定义供 Harness 动作模板、Worker authoring、stability 和 formal replay 消费；沿用现有执行器，不另建绕过 MCP/Harness 的浏览器控制面。
3. 迁移实际调用旧登录的受控适配器与动作模板，支持 Keycloak 控件的真实定位形式；删除无产品消费者的旧密码登录逻辑，不留静默 fallback。
4. 保留账户查看、余额/状态的具体业务动作；不能以“登录成功”代替 A01 账户断言。不得恢复 direct access grant 的浏览器密码换 token 路径。

完成门：纯编译 CONTRACT 不再产生门户页 username fill；隔离浏览器集成覆盖 SSO → Keycloak → 回调以及重复访问/刷新，不调用测试专用模型冒充 LIVE；正式与作者化认证序列一致。

### R4：质量用例列表按预算分页

业务目标：累积真实测试历史后，质量页面仍能完整查询而非 413 或隐藏数据。

微观步骤：

1. 将 `/api/quality/v1/cases` 改为明确的只读分页响应，含 items、nextCursor、hasMore；搜索/状态过滤在服务端执行，跨页结果可达。保留稳定排序和同时间戳的 case ID 次序。
2. 每页 SQL 有界、响应按既有预算有界；单条无法返回时保留明确错误，不默默丢弃。沿用现有输出预算方法，不扩大整个 Harness L1 或 L3 限制。
3. 同步根 Quality OpenAPI、生成类型、`qualityApi.cases()` 与 CasesPage 的分页/过滤调用。仍仅 GET、loopback、脱敏、无浏览器 service token。
4. 使用超过本次 115,442 字节规模的合成合同数据验证多页完整性、过滤、无重复/丢失及每页预算；真实环境只读翻页验证，不删除历史用例。

完成门：大列表不再 413，所有页可达；前端构建和相关测试通过；Quality 没有写接口。RC-05 与 A01 修复分别记录证据，不互相替代。

### R5：新身份与 A01 复验

1. 治理/文档/上述 focused CONTRACT 和浏览器集成全部通过后，按现有 v4 算法重算身份，记录新身份与旧失败记录，禁止把本次失败覆盖成成功。
2. 仅通过受控 lifecycle 定向替换修改代码所属的 Harness/Worker（MCP 仅在其合同时变更）；其余银行服务和卷保持运行，无 down/reset。
3. 取得新身份的明确 LIVE 授权，再执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/rf057-bank.ps1 -Profile Agent`；首次确定性失败即停止。
4. 通过条件：A01 退出 0，真实账户页业务断言完成，Journey 终态、Run PASSED、Task SUCCEEDED、五类制品可验证，Quality 同一 Run/Identity 回读，测试身份清理完成，前后身份相同且服务仍运行。
5. 只有 A01 通过后才继续 A02-A07，再进入 S3 的七项压力/性能场景；CONTRACT 或登录集成不得计作整套测试完成。

## 四、路径和变更批准要求

本轮仅新增本文件及更新 RF-057 证据/决策链接、backlog 的证据指针。没有扩大现有 S2 可写路径或合同预算。

实施前在唯一顺序文件、batch、S2 slice 和 S2 task 补齐上述五个小任务与白名单。拟增产品白名单仅限以下相关源及其 focused 测试：

- `platform/hengzhun-regression-system/harness/src/i10/{schemas,service}.ts`、`harness/src/i8/script-package-builder.ts`、`harness/src/i8/adapters/fuxing-bank-demo.ts`、`harness/src/i8/target-adapter-registry.ts`、`harness/src/quality-read-model.ts`、`harness/src/server.ts`。
- `platform/hengzhun-regression-system/worker/src/i10-midscene-candidate-authoring.cjs`、`worker/src/i10-worker-utils.cjs`、`worker/src/adapters/fuxing-bank-demo/` 及实际消费认证定义的 stability/formal 文件；先列出消费者，不宽泛允许所有 Worker 文件。
- `platform/hengzhun-regression-system/scripts/verification/` 下上述问题的 focused 测试、`scripts/test/rf057-agent.mjs` 及其测试；仅在真实 CLI 输入绑定必须调整时加入 `agent-cli/src/production-service.mjs`，不扩散到控制器模型重构。
- `contracts/openapi/quality-platform-api.yaml`、`apps/quality-case-portal/src/{api,pages,types}.tsx/ts`、对应生成类型；实施时白名单展开为真实文件路径。
- 必要的现有平台认证合同/类型与 identity manifest 登记：先列出实际文件和合同计数；当前 `maxContractsChanged=1` 已包含身份 manifest，不能未经批准再添加合同变更。每个小任务只打开直接相关的两个模块。

禁止路径和动作保持：银行 Java 生产代码、Fineract 数据库、Keycloak 认证降级、Flowise、运行时 Mock、删卷、删历史证据、推进 Fineract 日期、宽泛暂存或 Git 发布。

## 五、验证与当前完成状态

本次已执行：受保护 Journey/Candidate/Case/TargetProfile 只读回读；已失败 job 的结构化诊断字段投影；真实门户零交互 DOM 检查；现有编译器纯函数机制复现。未调用新的 BYOK 模型、未填写凭据、未创建新 Journey、未重跑 LIVE、未改产品代码。

文档门：`python scripts/architecture/validate_refactoring.py --batch RF-057`、`python scripts/docs/validate_docs.py`。

修复期 focused 命令应在 S2 任务细化时绑定到新增测试文件和隔离数据根；不得运行会重建历史 Agentflow 的宽泛测试命令。完成门仍是 R5 的真实 A01，不是本诊断文件或纯函数复现。RF-057 当前整体 **未完成**。
