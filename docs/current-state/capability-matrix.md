---
id: DOC-D3CCB3768E
title: Current capability matrix
document_type: reference
domain: current-state
status: verified
authority: evidence
version: 1.8
effective_date: 2026-07-31
owner: project-owner
---

# Current capability matrix

## 公开源码同步（2026-11-01）

RF-068 S5 已在 2026-10-26 冻结身份 `8ff4a6bcf75ed230719dbae4f6c01aa77b351b2e699b8f1bea68c5a02bc62157` 下完成真实 BYOK 只读验收：10阶段、10检查、7工件验证，历史/刷新/网页重启不重派，银行账户与流水前后相同。详见[最终回执](../architecture/refactoring/batches/RF-068/S5-json-root-cause-20261026.md)。此结果不提升 RF-057 正式28项、RF-065供应链/远端CI或整体发布状态，整体仍为 NO_GO。首页截图只展示该次实机结果，不表示当前源码身份已经重新验收。以下旧时间点结论仅保留为历史，不覆盖本节。

## 规范化实施增量（2026-10-09）

发布单入口、证据真实性、A04缺输入及A07指定断言失败证明、A05原Run恢复、A06冻结脚本新Run复用已补源码及合同/隔离验证。A03/A04/A05/A06真实驱动已接入，但未在这些修改后的身份上执行BYOK；不能记为LIVE完成。A02资金Fixture隔离/真实转账适配、A07运营认证及阶段边界、P05、RF064余项、全仓CI和候选验收仍未闭合。当前正式门为RF057的14银行+7Agent+7性能，不是历史Full18；整体NO_GO。下面较早“当前”条目只保留其当时结论，不覆盖此增量；银行此前14项结果也不是修改后源码的验收。

实施证据见[RF057证据索引](../architecture/refactoring/batches/RF-057/evidence-index.md)与[剩余驱动修复](../architecture/refactoring/batches/RF-057/a02-a06-runtime-gap-repair.md)；唯一工程状态仍是backlog。

## RF063当前复审（2026-10-02）

更新后的银行黄金转账完成（Fineract交易65）；RF057业务集9项通过、B13核心总账对账失败后停止。只读诊断确认演示储蓄产品accountingRule1且核心journal总数0。当前Agent为STALE_SOURCE；压力性能及新身份LIVE未完成，整体NO_GO。

`demo.ps1 verify`已补明确NO_GO/退出5的失败语义，完整当前清单证据接入仍未完成；不能把该入口存在称为发布验证完成。Quality已实现SQLite身份/失败投影，但正式发布裁决生产者仍缺失。详情及剩余任务见[RF063独立复审](../architecture/refactoring/batches/RF-063/root-cause-and-review.md)。以下日期更早的结论仅作历史。

## 当前组合产品（2026-09-21）

| 能力 | 当前证据 | 结论 |
|---|---|---|
| Windows 演示启动 | `demo.ps1 up` 完整退出码 0；`status` 为 READY；核心、渠道和 CLI 三服务就绪 | 本机运行门通过；不等于新克隆或冷启动验收 |
| CLI Agent 依赖自检 | `hz-agent doctor` 返回 READY，六项检查均 READY | 本机就绪；不等于执行过新的 LIVE Journey |
| 银行黄金业务 | 已有历史业务证据；本次 P0 未运行 `run-golden-path` | 需要独立业务验收，不因启动就绪自动通过 |
| A06 L1 与 Full18 | 当前身份 `445ed03a…d6e2bcf` 尚无本次 TEXT_ONLY / TEXT_WITH_IMAGE 完成证据 | BLOCKED；不能引用旧 Flowise 18/18 作为当前 CLI 结果 |
| `demo.ps1 verify` | 当前入口返回 `DEMO_COMMAND_NOT_IMPLEMENTED` | 未实现 |

以下为银行历史实现及 I8/I9/I10 阶段证据；各行的 VERIFIED 仅限行内标注的身份、环境与阶段，不代表上述当前 CLI 发布门。

> This matrix describes banking-core implementation and accepted evidence, not automatic readiness of every newly created identity. A Keycloak user becomes a usable banking customer only after an explicit `customer_identity` link to a Fineract client exists. Historical synthetic-user E2E evidence does not prove that an independently created demo user is linked. It is not a completion claim for the v5.4 regression platform. The combined external-demo target and migration boundary are defined in [`../architecture/v5.4-external-demo-baseline.md`](../architecture/v5.4-external-demo-baseline.md).

| Capability | Implemented | Runtime evidence | Status |
|---|---:|---|---|
| Phase 0 baseline and backup | Yes | Hash, OpenAPI parse, restore drill | VERIFIED |
| Customer login and account query | Yes | Portal username/password form, customer Realm/Client and a temporary synthetic-user graphical smoke are proven; persistent demo credentials still need user-entered browser acceptance, explicit Fineract identity linking and restart re-verification. Phone-number login and session renewal are not yet verified | PARTIALLY_VERIFIED |
| Beneficiary tokenization | Yes | Authorized customer create/list returned masked `****7890`; temporary data removed | VERIFIED |
| Notifications | Yes | Customer transfer produced one subject-scoped `TRANSFER_SETTLED` notification | VERIFIED |
| Transfer receipts/statements | Yes | Repeatable customer E2E verifies JSON/PDF receipts, 64-digit SHA-256, CSV/PDF statements, balance equation, and identical statement replay | VERIFIED |
| Internal transfer | Yes | Customer-owned source enforcement (403), idempotency replay/409 conflict, successful core posting with receipt/notification, insufficient-funds `FAILED`, and checker-approved `COMPENSATED` reversal | VERIFIED |
| Mock clearing | Yes | Authorized E2E runner passed SUCCESS, TIMEOUT, DUPLICATE, OUT_OF_ORDER and RETURNED with signed callbacks; compensation uses reversal workflow | VERIFIED |
| Risk/Maker-Checker | Yes | REVIEW decision, maker self-check 409, independent PAYMENT_APPROVER ALLOW | VERIFIED |
| Operations Web | Yes | `/ops/` HTTP 200; role user allowed and no-role user denied on risk API | VERIFIED |
| Monitoring alerts | Yes | Authorized endpoint surfaced OUTBOX_BACKLOG P2, RECONCILIATION_DIFFERENCE P1 and DLQ_NON_EMPTY P1; core outage branch is implemented | VERIFIED |
| Backup/restore | Yes | Core temporary-target restore (285 tables) and channel temporary-target restore (12 tables) | VERIFIED |
| Loan application draft/submit | Yes | Authorized customer draft-to-submit path passed in scoring/Maker-Checker E2E | VERIFIED |
| Loan documents/checklist | Yes | Authorized customer upload/list returned one `ID_CARD` document with `RECEIVED` status; temporary data removed | VERIFIED |
| Deterministic loan scoring/Maker-Checker | Yes | Authorized LOAN_OFFICER score=99; maker self-check 409; independent LOAN_APPROVER approved | VERIFIED |
| Loan core lifecycle/accounting | Partial | Authorized submit/approve/disburse/repayment/close path passed; Fineract reported Closed (obligations met) and zero outstanding; maturity scenario passed | PARTIALLY_VERIFIED |
| EOD/reconciliation orchestration | Yes | Authorized EOD plus all three reconciliation types returned MATCHED with zero differences and balanced debit/credit totals | VERIFIED |
| Cashier/freeze/close/maturity operations | Partial | Authorized cashier read, block/unblock, business-date move/restore, one-period maturity schedule, post-maturity close, and premature-close HTTP 409 passed | PARTIALLY_VERIFIED |
| Final full regression | Partial | Repeatable smoke regression and backup drills pass; E2E-001 to E2E-014 are not all automated/executed | PARTIALLY_VERIFIED |
| Local identity-data readiness | Partial | Keycloak persistence and default `CUSTOMER` role are configured; each persistent demo customer still requires enabled/no-required-action checks, a unique Fineract client link and credential-private graphical acceptance | PARTIALLY_VERIFIED |

Customer graphical password-login qualification and its local-demo/production boundary are detailed in [`../evidence/frontend/customer-password-login-gap-2026-07-16.md`](../evidence/frontend/customer-password-login-gap-2026-07-16.md).

## v5.4 regression-platform target status

| Capability | Current status | Evidence/qualification |
|---|---|---|
| Dedicated Node/Playwright/Midscene runtime | VERIFIED | `platform/hengzhun-regression-system/runtime` now contains the product-local verified copy of Node 20.20.2, Playwright/Test/Core 1.59.1, Midscene Web/CLI 1.10.5, Chromium revision 1217 and FFmpeg revision 1011; legacy `platform/runtime` is retained temporarily as rollback source |
| Hengzhun I0-I7 single-directory product skeleton | VERIFIED_HISTORICAL | Product root, module boundaries, `.data` isolation, fixed runtime, Harness, Worker, Model Gateway, OpenAPI, Coze public configuration and I1-I7 verifier are present and pass; this does not prove the I8 Flowise target is implemented |
| RegressionCase, Fixture, Baseline and human-success evidence | VERIFIED | I4 三条低风险案例使用独立 BrowserContext、Fixture 隔离和脱敏证据通过；正式脚本需 `SCRIPT_VALIDATED` |
| Repository development RAG | NOT_BUILT / DEVELOPMENT_ONLY | 当前 `rag/index/manifest.json` 不存在；开发索引可按需重建，但不属于产品目录、运行时、验收或交付前置条件 |
| Coze runtime knowledge base | VERIFIED_HISTORICAL_DEMO | I3/I4/I6 的 Knowledge Base 历史演示证据保留；I8 不继续扩展 Coze |
| Coze Agent orchestration plus Harness tools | VERIFIED_HISTORICAL_DEMO | Coze 公开 Agent 已完成 I3/I5/I6 历史闭环；该证据不证明 Flowise 或 HiAgent 当前可用 |
| Flowise Windows technical probe | VERIFIED_PROBE_ONLY | Flowise 3.0.12、Bundled Node 20.20.2、SQLite、MiMo v2.5、MCP、Human Input、平台知识查询、流程导出和整目录复制重启通过隔离探针；只授权 I9 P1 正式运行时收编，不是产品验收 |
| I8 platform-neutral deterministic authoring engine | VERIFIED_I8_STAGE7_LOCAL | 阶段1—7本机代码链、累计32/32、阶段7固定Chromium修复候选6/6、全量verify和文档校验完成；真实Flowise产品化已移交I9 |
| I8 Flowise Agentflow artifact | VERIFIED_STAGE3_ARTIFACT | Flowise 3.0.12节点类可加载；唯一用户输入为案例描述；知识、结构化、澄清、Human Input、MCP、候选编译和回显均有HiAgent映射；未做真实Agentflow发布/MiMo对话 |
| I8 MCP control channel | VERIFIED_I8_STAGE7_LOCAL | Bearer Streamable HTTP、14工具白名单全部ACTIVE；`failure_get/repair_propose/decision_submit`仅映射受控Harness操作，技术版本、Fixture和凭据别名由MCP/Harness注入；不能外推为Flowise发布或HiAgent网络已通 |
| I8 case-to-intent handoff | VERIFIED_I8_STAGE2 | migration 010、严格Schema、幂等、Hash、不可变源字段、人工APPROVE/REJECT及`AWAITING_STAGE3`最小状态查询通过测试 |
| I8 deterministic script candidate | VERIFIED_I8_STAGE3_LOCAL | migration 011、严格ExecutableActionPlan、10操作DSL、固定模板Builder、候选版本/Hash/来源链和不可变SQLite记录通过；同输入生成字节一致脚本 |
| I8 candidate Worker allowlist | VERIFIED_I8_STAGE3_CONTRACT | 受控候选目录、manifest/脚本Hash、固定模块契约和危险能力拒绝通过Fake Page集成测试；真实Chromium证据与签证由独立阶段4门禁提供 |
| I8 Playwright stability certificate | VERIFIED_I8_STAGE4_LOCAL | migration 012、固定1440×900/390×844各3次、全新BrowserContext、空认证状态、独立Fixture、候选/运行时/证据Hash和不可变证书已落地；合成门户和真实复兴银行门户均由固定Chromium完成6/6，不能外推为Flowise/MiMo/HiAgent已验收 |
| I8 controlled script delivery | VERIFIED_I8_STAGE5_LOCAL | migration 013、持证Hash复核、完整行分页预览、5分钟一次性下载、SAVE_ONLY/ACTIVATE/REJECT不可变决策、精确版本激活和并发冲突拒绝通过；激活不自动运行或调度 |
| I8 activated on-demand regression | VERIFIED_I8_STAGE5_LOCAL | 已激活候选由常驻Worker以固定Chromium和纯Playwright执行；合成门户和真实复兴银行门户正式复跑均通过，任务状态可查询；阶段6另已完成周期/一次性调度 |
| I8 exact-version scheduling | VERIFIED_I8_STAGE6_LOCAL | migration 014回填历史周期调度并冻结案例/计划/脚本版本和Hash；支持五字段Cron与带偏移runAt，一次性终态自动停用；脚本current_version漂移后仍由固定Chromium运行冻结版本 |
| I8 offline result inbox | VERIFIED_I8_STAGE6_LOCAL | 每个正式Run终态按namespace+runId幂等写入不可删除SQLite收件箱；支持倒序分页、未读筛选与确认已读，只返回脱敏摘要和Artifact元数据 |
| I8 restricted reverse repair | VERIFIED_I8_STAGE7_LOCAL | migration 015、十一类事故、CTX-L1/L2/L3证据升级、最多3候选、严格补丁白名单、每候选独立Hash和六次重新签证、显式激活、修复版本按需运行和新调度精确绑定已通过自动测试；不自动迁移既有调度，不修改被测项目 |
| I9 Flowise portable product | VERIFIED_LOCAL_I9_P9_FOLDER_EXPORTED | P1—P9本机范围已关闭：正向20节点、反向37节点、两次固定Chromium 6/6、14项MCP、双SQLite恢复和当前电脑最终目录5/5机器门禁均通过。冻结提交`3884b6d843a47f48ab4880d68589d411bde99969`导出唯一未压缩目录，清单SHA-256为`3b088ec9f42d127c3b19f6f9ab97174a8476413164d83e960b75e043f8a0e7ae`；第二台电脑与HiAgent仍是后续环境证据 |
| I10 Flowise formal regression product（统一受理、真实视觉作者化、本机Windows交付） | VERIFIED_LOCAL_I10 | 2026-08-02回灌后以ReleaseIdentity `632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f`重算：当前账本18/18、9/9语义匹配、`full18ChainAccepted=true`；Harness迁移36/36，Worker代码身份匹配，Flowise v7由公开API回读为`deployed=true/isPublic=false`且部署Hash一致；DeepSeek V4 Flash与MiMo v2.5真实探针均`mock=false/degraded=false`；清单重算后`VERIFY`为285个核心文件、6组资产、禁止项0并返回`I10_PORTABLE_FOLDER_VERIFIED`。证据见`docs/evidence/platform/hengzhun-i10-post-backfill-baseline-2026-08-02.md`。该结论只覆盖当前本机，不证明第二台电脑、HiAgent服务器或任意Windows环境。 |
| Harness governed action context | VERIFIED_I8_STAGE1 | migration 009、严格Envelope、Hash、单动作租约、不可变预算审计和L1→L2→L3通过自动测试；历史SQLite游标和Playwright推进继续有效 |
| Controller-to-visual sliding context | PARTIALLY_IMPLEMENTED_STAGE3 | Worker已消费完整获批Envelope，Flowise已交接IntentPlan并生成ExecutableActionPlan；真实MiMo视觉E2E仍未运行，usage未公开时只记录`NOT_EXPOSED` |
| Midscene visual Agent plus Playwright fact collection | PARTIALLY_VERIFIED_WITH_FALLBACK | `INPUT/TAP/SCROLL` 通过五视口门禁；`LOCATE` 降级并强制 Playwright-only，所有事实仍由 Playwright 独立验证 |
| Independent Playwright script validation | VERIFIED | 三案例脚本、隔离 Worker、独立 BrowserContext、断言和证据 Hash 已通过，未验证脚本不能正式执行 |
| Scheduled regression and automatic failure pause | VERIFIED | I6 验证互斥、misfire、补跑、重启去重、有限重试、最终失败暂停和人工恢复；正式调度不调用模型 |
| Reverse recovery with exactly two options | VERIFIED | 修复候选与 Schedule 恢复均由 Harness 保持版本化状态并要求 Coze 用户显式二选一，旧版本重复决策被拒绝 |
| Hengzhun observability frontend | DEFERRED | Legacy UI assets and browser fixtures exist but are outside the approved read-only boundary; they are not current capability evidence and must not be extended until `HZ-OBSERVABILITY-001` is resumed |
