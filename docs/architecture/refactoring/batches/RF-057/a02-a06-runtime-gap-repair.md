---
id: DOC-ARCH-RF057-A02-A06-RUNTIME-GAP
title: RF057 剩余场景运行缺口与修复
document_type: reference
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-10-09
owner: Codex
---

# 剩余场景运行缺口与修复

本文件细化现有 S2，不新建实施路线。用户已授权自主细化、执行和复审；当前仍 IMPLEMENTING/NO_GO。以下区分源码事实、已复现合同失败及尚未运行的真实业务，不能把分析写成 LIVE 通过。

## 已复现并修复

| 来源 | 根因 | 已落地修复及证据 |
|---|---|---|
| A05 CLI 恢复 | `journeyExecute` 只接受 PROCESSING_AUTHORING；RUNNING 旅程被拒绝，进程恢复不能续接原 Task | RUNNING 从持久引用续接；已完成则读取同身份终态证据，不提交新 Run。原 Task 失败保留错误。execute 合同与真实 MCP/隔离投影9/9 |
| A01/A03/A05 只读输入 | “不发起转账”仍匹配转账关键字；同时“发起转账并核验转账结果”被全局查询排除规则漏掉 | 两个现有作者化边界仅消除明确否定/查询短语后判断；资金字段不自动填补。作者化与新鲜 Harness 合同10/10 |
| A05 发布真实性 | 发布门只要求任意成功 Run，无法证明 CLI 确实中断且恢复了原 Run | 驱动读取 RUNNING 旅程及 QUEUED/RUNNING Task 后停止自己启动的 CLI；留下绑定身份/旅程/Run/Task/时刻的工件。发布门核对登记工件、原/恢复引用和前后核心余额/流水。正常成功但无中断工件、恢复到另一 Run、资金变化均拒绝；本地 SQLite 回归通过 |

上述 A05 实机驱动只通过语法与相关接口测试，未执行真实 BYOK。驱动异常时只终止其自己的 CLI，Worker/银行服务继续运行。尚不宣称任意作者化阶段的进程恢复已经实现。

## A02 的源码证据与资金验证前置

1. 当前客户页面实际结果地址为 `/portal/transfers/{transferId}`，页面显示“转账已成功”及 SETTLED 的中文状态；旧适配器和验证策略仍固定 `/portal/orders/query`、`transfer-order-number`、`transfer-order-status` 和“受理成功”。来源为 Customer `TransferResult.tsx`、Worker `adapters/fuxing-bank-demo/index.cjs`/`verification-policy.cjs`、Harness `i8/script-package-builder.ts`。这是迁移未收尾的源码不一致，尚未执行 A02，不称为已发生的账务错误。
2. 编译器保存 `TRANSFER.PAYEE_REF` 和币种，但固定转账模板只填金额及用途，未核验实际选中的付款账户、收款人和币种。客户页仅在唯一候选时默认选择；不能依赖“第一个候选”代表明确收款人。
3. 稳定性运行的新 BrowserContext 隔离 Cookie，不隔离账务：`i8-stability-runner.cjs` 给各样本同一凭据，并调用完整候选；作者化也真实执行 click/验证动作。不同 `fixtureRef` 名称不是不同客户/账户/余额。当前尚无证据证明真实银行资金样本已隔离，不能据名称宣称资金隔离，也不能在原演示账户上连跑资金稳定性样本。

### S2 内的修复次序

Latest foundation closure:Test Support0.3.1 balance serialization was numeric despite a decimal-string consumer requirement; a failing JSON serialization test then producer/schema/examples/consumer fix made it explicit. Java21 now passes106 current tests. Windows PowerShell5.1 separately stripped Node `-e` quotes at BASELINE_READ; failed report `d84848a574ae4674b23e391a7f659836` has no account attempt and completed cleanup. Node stdin parsing removes that entrypoint defect. Fresh real report `100c507bc59e442688734df0c52d06a3` passed on new pairs10/11 and12/13, without changing baseline3/4 or the business-date collection. These are bank integration results, not Agent execution.

This source mismatch is now repaired at the input contract: `controller/src/journey-author.mjs`, `harness/src/schemas.ts` and the normalizer use TypedBusinessInputsV2, real beneficiary UUID and explicit payerAccountId. All five business fields freeze together; the compiler no longer extracts money from legacy prose. The author rejects an account copied from an unrelated number in the goal. A further red/green regression prevents20-digit account truncation, numeric account/amount coercion and silent V1 upgrade. This is source/contract progress, not actual adapter selection or independent funds samples; those remain required before A02. Existing immutable historical evidence is unchanged.

Current v2 example (illustrative contract, not live authorization or a funded fixture):

```json
{"schemaVersion":"hengzhun-i10-typed-business-inputs-v2","source":"USER_CONFIRMED","values":{"payerAccountId":"3","payeeRef":"11111111-1111-4111-8111-111111111111","amount":"1.00","currency":"CNY","purpose":"回归验证"}}
```

The actual account and beneficiary must come from the declared formal/synthetic sample; this example must never be substituted into runtime. A goal binds the payer explicitly, e.g. `付款账户 3`, rather than relying on the same number in an amount or sequence.

2026-10-09 money-isolation foundation now has a typed Test Support-only prepare API, scoped core clients/accounts, atomic new-or-same identity binding and actual beneficiary Repository reuse. Initial balances are1000.00/2000.00 CNY; replay requires the unchanged single funding transaction and never tops up existing accounts. This foundation is not yet Worker/Harness per-sample wiring or A02 acceptance.

Latest3s closure: Test Support0.3.2 adds authenticated read-only GET validation of an already prepared fixture using subject and beneficiaryRef. It verifies the real owner/mapping/destination, active CNY cash-GL account, exact unused balances and single initial funding history without any write or repair. Java21 current full111/111 passed. Only Test Support was replaced; real reporta1091c7cb9654a309ea641dce91e502b passed on new pairs14/15 and16/17, repeated GETs and unchanged core snapshots, while original3/4/date collections and other14 banking containers remained unchanged. This bank readback is ready for CLI provisioning to consume; it is not a five-sample Agent pool orA02.

Stopped real integration attempts are retained: `agent/runs/rf057-transfer-fixtures/fbb382f8ecf142f89adec7e8926da1dd.json` failed at baseline fixture lookup; current canonical external IDs independently resolve to core accounts3/4, while the legacy protected fixture query also requires mutable fixture identity mappings. `97da0aed267e45b5a543e71a34c3a5fd.json` then exposed BUSINESS_DATE detail404; the collection API returns200 with no configured records. The runner now reads canonical external IDs directly and compares that collection without creating a date or substituting the HTTP Date header. Empty is unconfigured, not successful EOD/date acceptance.

`ee6a2b50ef42466ea2035409f0edf5b1.json` stopped at prepare409. Read-only core lookup found this owned account5 with0 balance and status `savingsAccountStatusType.submitted.and.pending.approval`; the initial new service/test used the wrong camel-case status. Replacing the test response with the observed value reproduced7 tests with1 failure/4 errors, then the implementation was corrected. All three stopped attempts completed owned identity cleanup; the partial core account is retained and not funded on replay. Final regression/runtime results belong in evidence-index, not inferred here.

- 先为作者化和每个资金稳定性样本建立独立合成客户/账户/收款人及身份映射，全部通过现有银行 Test Support/Fineract API，不写核心数据库，不重置原演示卷或历史，不改业务日期。Fixture 注册必须绑定实际核心账户和凭据引用；只读场景无需增添资金 Fixture。
  Harness侧绑定门已实现：CaseDraft冻结一组作者化和四组稳定性资金样本，十个独立账户并排除正式账户；缺池、凭据未就绪、重复物理标识均阻止资金候选领取。作者化租约过期记结果未知，不重排；已领取样本不能跨案例/命名空间复用。实际Fixture UUID在验证行初建时冻结，原不可变触发器保留。Worker逐样本解析凭据，替换绑定的付款账户/收款人/币种，保留冻结金额/用途；首次失败即停止。启动、凭据或截图不可用时，明确回传下一样本的executionFailure，保留已完成前缀，余下未执行；不编造失败耗时、工件或运行时身份，不签证书，要求人工介入。金融工件同时核验样本所属目录。租约检查在执行及非只读请求边界保留。相关168项回归包含25项样本池/隔离SQLite及真实Chromium合同，不是五组真实银行账户或模型验收。银行所有权/未使用余额核验、CLI真实准备入口及当前结果页适配仍未完成。
- 更新唯一适配器的实际结果路由/目标、显式账户/收款人/币种核验。确认动作每个样本仅一次；未知结果只查询原操作，不重复点击确认。删除旧结果路径，不留历史回退。
- 在隔离集成测试先证明每个样本的账户互不相同且余额守恒，再接入 A02 的真实 BYOK 小额转账。A02 正式 Run 使用明确指定的原合成目标账户；其增减必须恰为1.00 CNY，且通过客户/运营/Core关联号和交易号回读，不把作者化/稳定性账务混进正式 Run。
- 正式允许路径在现有 S2/batch/backlog 中先补齐具体 Fixture 实现文件再改；范围不扩展到业务日期、原卷或核心 SQL。新金融 Fixture 行为必须有真实 Fineract 集成证据，不用响应 Mock 作为验收。

## A06/A07/P05 下一步

步骤3x已补A02发布业务门：从实际Run绑定的不可变案例版本读取V2业务输入与资金池正式账户，不读最新版本或报告自称目标；每份A02报告均重算资金与回读条件，缺证据、错误账户/关联、未结算、假总账、余额不守恒或重复流水均NO_GO。Node20发布验证器/客户端合同28/28及TypeScript编译通过，这是本地合同数量，不是正式28场景。当前剩余转账适配、实机五用户准备及最终身份真实验收；A02仍未LIVE通过。

步骤3w已把五身份生命周期与生产者接入A02真实驱动入口：Agent配置独有五个新CUSTOMER，逐个持久登记清理范围，失败清理不跳过其余对象且不能报COMPLETED。A02正式run消费池文件，以客户/运营SETTLED、真实核心交易关联、1.00双向余额变化和各一笔新流水判定；失败只读回查、标人工介入、不重提。13项Node合同与3项PowerShell隔离生命周期合同通过，没有银行/模型调用。剩余明确前置：当前转账页/结果适配、Harness发布验证器对A02业务证据的严格准入、真实五用户准备及最终身份LIVE；A02尚未通过。

步骤3v已补固定五组生产者及共用本地凭据登记：逐组prepare→受认证GET一致回读，全部银行核验后登记五份独立凭据，并输出既有严格池合同；物理账户/客户/收款人复用在首个错误回读即时拒绝。12项源码合同通过，不代表真实五用户或可执行A02。五用户创建/清理、A02对该生产者的调用及当前页面适配仍未接通；不复用已清理身份的旧准备报告作为资金样本。

2026-10-09 CLI传递与绑定增量：journey author及public run均接受独立本地资金样本JSON，严格合同检查在模型调用前，正式金融CaseDraft的账户/币种/凭据/收款人分离检查在MCP准备写入前。既有Journey或旧批准路径不得忽略输入池。另已复现并修复自然语言目标中的credential引用被外发模型；仅修改外发上下文，原目标/hash/业务值保持。该入口尚不证明真实银行所有权，可信五用户准备/0.3.2 GET消费/本地凭据登记与当前转账适配仍待完成，不运行A02或冻结身份。

A06 源码闭环已落地：先 `hz-agent session start`，再 `hz-agent journey execute <已通过来源Journey> --session <新会话> --repeat --jsonl`。不加 `--repeat` 的已完成 Journey 仍是原 Run 恢复。复用入口在现有 journey_prepare 中绑定 v6 和 validatedJourneyId，禁止新目标/凭据/业务输入；Harness 验证原证据及仍激活的同身份冻结候选，再创建新的 Journey。后续复用既有执行计划/决策/Run API，不重新调用模型、作者化、编译或激活。原 Journey 与制品不改动，同一新会话请求重放仍返回该次新 Run。退役、旧身份和不完整制品被拒绝。

A06 的发布证明要求两个当前身份成功运行的案例/版本/计划/候选一致、脚本摘要一致、Run/Task不同；报告还须绑定已登记A01来源及前后不变的核心余额/流水。普通PASSED、其他来源或发生资金动作不能代替该场景。真实驱动已接入，尚未执行BYOK；详细检查记录见 evidence-index。较广Journey回归发现资金缺输入时会丢失显式适配器，已保留为含具体缺口的规范化DRAFT，仍禁止审批/执行。

A07 需要在脚本完成验证后、正式 Run 前改变指定文档状态；CLI目前将编译/激活/正式运行串成一个调用，必须提供明确阶段边界，不能靠随机延迟竞态或篡改冻结脚本。只允许指定的草稿断言失败。

当前认证合同 `fuxing-bank-demo-auth-v2.json` 只声明客户门户18082、bank-customer realm及客户回调/主页；A07文档位于运营门户，不能用客户档案冒充运营登录。需要在明确选择的运营目标档案中冻结实际realm/回调/导航边界，再验证运营身份登录与指定文档断言；不能给泛用Worker隐式加入权限或历史门户回退。

P05 复用上述只读冻结脚本的正式执行入口，1/2/4并发分别记录实际排队/执行和终态工件。仍未实现，不允许靠报告数量获得通过。修复源码后统一构建，再冻结身份并进行明确授权的真实验收。
