---
id: DOC-AGENT-HENGZHUN-I10-LIVE-E2E-17
title: 新 ReleaseIdentity 重基线与18条 LIVE_E2E 补验任务包
document_type: task
domain: agent
status: BLOCKED
authority: normative
version: 1.2
effective_date: 2026-08-24
owner: project-owner
---

# 新 ReleaseIdentity 重基线与18条 LIVE_E2E 补验任务包

## 1. 权限与完成口径

本文件原先建立并控制 2026-08-04 身份下剩余17条补验；该轮用户批准到P3，并在M3 `TEXT_WITH_IMAGE`首个确定性产品缺陷处按规则停止。以下旧记录继续作为历史事实保留，但当前源码身份已改变，新的执行目标是经单独授权后从 `0/18` 完成全部18条。

当前唯一目标：先把 managed runtime 与公共回读对齐到授权时重新计算的源码身份，再保持该身份不变，将正式账本从 `0/18` 增加到 `18/18`，新增18条不可变 `PASSED` 记录，并证明9组文字/图片输入语义等价。

2026-08-04 历史冻结身份（不可复用）：

```text
identityHash = 6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687
flowVersion = 7
sourceFlowHash = eb1c56edeae6ff2d21fc341378a197d8b5d87f10337ed6d8f54498d6c7d87191
deployedFlowHash = c4878709c4d0c0b169e72d2c340b1376c2fac961be849826d88b84dc6b8a5e27
workerCodeSetVersion = WORKER_CODE_SET_V1
workerCodeSetHash = bf2d2e7ed026a7f3a3e05bd9e9204328b4f18f5ce356e4afaed5305cf766e198
workerCodeSetFileCount = 24
migrationVersion = 36
caseCatalogHash = 6adb37970b49beb9fda002cf0edb89708716cf371de2b80cd18f59646c0b1831
before.currentPassed = 1
required = 18
```

当前唯一可复用记录是同一身份下的 `L1 / TEXT_ONLY`。旧身份下17条历史记录只用于诊断，不计入当前验收。

2026-08-04 历史执行状态（不是当前完成标签）：

```text
P0 = COMPLETED
P1 = COMPLETED
P2 = COMPLETED
currentPassed = 6/18
historicalStale = 12
L1/L2/L3 pairStatus = SEMANTIC_MATCH
P3 = STOPPED_ON_DETERMINISTIC_PRODUCT_DEFECT
P4-P5 = NOT_AUTHORIZED
```

### 2026-08-24 当前前置门（覆盖旧执行快照，不改写历史记录）

TP-00 至 TP-07 的源码/供应链任务包现已全部完成，但它们形成了新的源码身份：

```text
source.identityHash = 02ae6b18ed678415488db431f1c271ec258ec6475a1414864731d495a8d81dc4
source.releaseCodeSetFileCount = 160
source.flowiseRuntimeForkClosureHash = 8be1c36a094046b4d2c834a8e287f66a44a50c46a2d7178b87f132ad11fb6144
ledger.currentPassed = 0/18
ledger.historicalStale = 228
ledger.checkpoints = 1
managedReload = COMPLETED_THEN_ROLLED_BACK_AFTER_FIRST_FAILURE
publicReadback = REFRESHED_2026-08-24T00:25:39.225Z
releaseAlignedBeforeAcceptance = true
browserOcrEvidenceIdentity = b514f9d8b55ce623ec210cc11c448d385aa048d6ec7a4311ef60ccdd6a373738
browserOcrEvidenceMatchesCurrentIdentity = false
P4-P5 = NOT_AUTHORIZED
```

因此上面的 `6a1fd9a7...` 冻结身份与 `1/18` 起点只保留为 2026-08-04 历史执行合同，不能继续驱动新验收。2026-08-24 首次授权已完成 managed reload、公共 Flowise readback 与新 ReleaseIdentity freeze，并在 P1 薄链首个确定性失败处耗尽；下一次 Browser/OCR 刷新和 L1 重试仍须取得新的明确授权，授权不得从任务包创建、源码修复或“继续”字样推导。

授权后的当前执行模板如下；任一步失败立即停止，不进入后继步骤：

```powershell
$ProductRoot = 'D:\Agent\banksystem\platform\hengzhun-regression-system'
Set-Location -LiteralPath $ProductRoot

# 1. 仅保存身份/状态快照，不读取日志正文或凭据。
$SnapshotRoot = Join-Path $ProductRoot '.data\evidence\i10\preflight'
New-Item -ItemType Directory -Path $SnapshotRoot -Force | Out-Null
& 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' `
  -Root $ProductRoot -SnapshotPath (Join-Path $SnapshotRoot 'before-managed-reload.json')

# 2. 受管启动会先 PREPARE、核对端口/进程所有权；任一服务失败时回滚本轮新进程。
& '.\scripts\start-i9.ps1'
if ($LASTEXITCODE -ne 0) { throw 'MANAGED_START_FAILED' }

# 3. 私有发布并通过公共 API 导出回读；不得手工编辑 publication manifest。
& '.\runtime\node-v20.20.2-win-x64\node.exe' '.\scripts\i10-agentflow-publish.cjs'
if ($LASTEXITCODE -ne 0) { & '.\scripts\stop-i9.ps1'; throw 'PUBLIC_READBACK_FAILED' }

# 4. 再次计算权威状态。必须 runtime=LIVE、readback=LIVE、releaseAligned=true、currentPassed=0。
& 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' `
  -Root $ProductRoot -SnapshotPath (Join-Path $SnapshotRoot 'after-public-readback.json')

# 5. 新身份必须先生成同身份的 Browser/OCR 前置证据。该步骤会启动受控门户、
#    创建一次性 DPAPI credentialRef、ACTIVE TargetProfile，并真实执行 Browser/OCR；
#    因而必须包含在下一次明确 LIVE 授权内，不能把旧身份 PASSED 文件直接复用。
$portalProcessId = $null
try {
  $env:I10_STAGE8_PORT = '28884'
  $bootstrapOutput = & '.\runtime\node-v20.20.2-win-x64\node.exe' '.\scripts\i10-l1-live-bootstrap.cjs'
  if ($LASTEXITCODE -ne 0) { throw 'L1_BOOTSTRAP_FAILED' }
  $bootstrap = $bootstrapOutput | ConvertFrom-Json
  if ($bootstrap.status -ne 'READY' -or [int]$bootstrap.portalPid -le 0) { throw 'L1_BOOTSTRAP_OUTPUT_INVALID' }
  $portalProcessId = [int]$bootstrap.portalPid

  $env:HENGZHUN_PORTAL_BASE_URL = 'http://127.0.0.1:28884'
  $env:I10_CASE_SUITE_CASES = 'L1'
  & '.\runtime\node-v20.20.2-win-x64\node.exe' '.\scripts\i10-browser-ocr-case-suite-live.cjs'
  if ($LASTEXITCODE -ne 0) { throw 'L1_BROWSER_OCR_REFRESH_FAILED' }

  # 6. 重新检查 result.json：status=PASSED、mock=false、degraded=false、
  #    releaseIdentity 必须等于第4步冻结值，L1 Browser/OCR 均 PASSED且截图存在。
  #    然后从 0/18 开始依次跑 L1 两个变体；每条首次确定性失败即停止。
  & '.\runtime\node-v20.20.2-win-x64\node.exe' '.\scripts\i10-18-chain-acceptance-live.cjs' run L1 TEXT_ONLY
  if ($LASTEXITCODE -ne 0) { throw 'L1_TEXT_ONLY_FAILED' }
  & '.\runtime\node-v20.20.2-win-x64\node.exe' '.\scripts\i10-18-chain-acceptance-live.cjs' run L1 TEXT_WITH_IMAGE
  if ($LASTEXITCODE -ne 0) { throw 'L1_TEXT_WITH_IMAGE_FAILED' }
} catch {
  & '.\scripts\stop-i9.ps1'
  throw
} finally {
  # 受控门户不属于四服务生命周期；仅当 PID、Node 可执行文件和命令行三者均与
  # 本次 bootstrap 精确匹配时停止，任何不确定性都保留进程并要求人工复核。
  if ($portalProcessId) {
    $portalProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $portalProcessId" -ErrorAction SilentlyContinue
    $expectedNode = (Resolve-Path '.\runtime\node-v20.20.2-win-x64\node.exe').Path
    $ownedPortal = $portalProcess -and
      [string]::Equals($portalProcess.ExecutablePath, $expectedNode, [System.StringComparison]::OrdinalIgnoreCase) -and
      $portalProcess.CommandLine -match 'i10-stage8-controlled-portal\.cjs'
    if ($ownedPortal) { Stop-Process -Id $portalProcessId -ErrorAction Stop }
    elseif ($portalProcess) { Write-Warning 'L1_PORTAL_OWNERSHIP_UNCERTAIN_NOT_STOPPED' }
  }
}
```

运行态回滚模板只停止生命周期状态文件中由本包拥有的进程：

```powershell
& '.\scripts\stop-i9.ps1'
```

不得为“回滚”删除 Journey、Run、Artifact、验收账本或已生成的不可变终态记录；后续恢复只能从精确 checkpoint 和同一身份继续。

## 2. 真实入口与边界

工作目录：

```text
D:\Agent\banksystem\platform\hengzhun-regression-system
```

唯一 LIVE_E2E 入口：

```powershell
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run <case> <variant>
```

状态入口：

```powershell
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-acceptance-ledger-v3.cjs status
& 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' -Root 'D:\Agent\banksystem\platform\hengzhun-regression-system'
cmd /d /c STATUS.cmd --no-pause
```

允许写入：

- 产品受管 `.data` 下由正式执行链生成的 Journey、任务、候选、证书、Run、收件箱、Artifact 和验收记录。
- `flowise/i10/publication-manifest-v1.json` 中由既有公共API发布/回读脚本更新的发布Hash与验证时间；不得手工编辑。
- 本任务包后续新增的脱敏执行证据索引。

禁止写入或变更：

- Agentflow、Harness、MCP、Worker、Builder、迁移、合同、案例目录或运行时源码。
- ReleaseIdentity 的任一组成字段。
- 历史终态记录、旧18/18证据、I9证据或账本内容的人工编辑。
- `.env`、`runtime.env`、凭据文件、模型密钥、内部令牌或明文账号密码。
- Git历史、分支、远端、ZIP或发布目录；本任务不提交、不合并、不推送。

## 3. 必须保持的合同

- 每条链必须经过真实 Flowise 对话/状态、Harness、受控MCP、Midscene观察定位、确定性Builder、纯Playwright验证、`I10_2X2_V1`四次稳定性、用户决策、正式执行或调度、结果收件箱和Artifact回读。
- `TEXT_WITH_IMAGE` 必须包含本机OCR成功、主控事实筛选和受控图片输入证据；不得用文字链结果冒充。
- Midscene只观察和定位；Playwright执行动作和断言。
- 登录案例验证策略为 `NONE`；H1-H3只在明确转账确认动作和真实页面证据下进入持久化U盾分支。
- 选择性执行只能复用当前身份、相同输入和相同Artifact的不可变终态证据，不能绕过作者化、Playwright、2×2、激活、正式执行或结果回读。
- 任何一次运行只允许产生一条对应案例/变体的正式终态记录；失败不计数。

## 4. 补验矩阵与顺序

| 阶段 | 案例/变体 | 本阶段新增 | 预期累计 |
|---|---|---:|---:|
| P1 | L1 `TEXT_WITH_IMAGE` | 1 | 2/18 |
| P2 | L2 `TEXT_ONLY`、L2 `TEXT_WITH_IMAGE`、L3 `TEXT_ONLY`、L3 `TEXT_WITH_IMAGE` | 4 | 6/18 |
| P3 | M1/M2/M3 各 `TEXT_ONLY`、`TEXT_WITH_IMAGE` | 6 | 12/18 |
| P4 | H1/H2/H3 各 `TEXT_ONLY`、`TEXT_WITH_IMAGE` | 6 | 18/18 |

同一案例固定先跑 `TEXT_ONLY`，再跑 `TEXT_WITH_IMAGE`；L1因当前文字链已通过，只补图片链。每一条完成后立即核对账本和身份，不批量积压到阶段末。

## 5. 分阶段执行

### P0：身份、发布和账本冻结

1. 保存执行前检查器快照：

   ```powershell
   & 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' `
     -Root 'D:\Agent\banksystem\platform\hengzhun-regression-system' `
     -SnapshotPath 'C:\tmp\i10-live17-before.json'
   ```

2. 要求 `releaseAligned=true`、身份精确等于冻结值、迁移 `36/36`、Worker 24文件集对齐、账本 `1/18`。
3. 若检查器报告 `PUBLIC_API_READBACK_EVIDENCE_IS_STALE`，使用现有公共API发布/回读入口刷新同一内容，并立即比较快照：

   ```powershell
   & '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-agentflow-publish.cjs
   & 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' `
     -Root 'D:\Agent\banksystem\platform\hengzhun-regression-system' `
     -CompareSnapshot 'C:\tmp\i10-live17-before.json'
   ```

   该操作只允许重新发布并回读完全相同的规范化Flow；刷新不得改变 ReleaseIdentity、节点/边或业务合同。不能手改发布证据时间冒充新鲜回读。
4. 若身份、发布Hash、WorkerCodeSet、迁移或案例目录发生变化，立即作废本包的冻结身份，停止执行并重新生成任务包。

### P1：L1 图片细链

```powershell
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run L1 TEXT_WITH_IMAGE
```

硬门槛：命令退出码0；输出 `status=PASSED`；产生一条当前身份的不可变记录；L1不再为 `PENDING_PAIR`；账本从 `1/18` 变为 `2/18`；身份保持不变。P1未通过不得进入P2。

2026-08-04实测结果：命令退出码0，耗时274.1秒，记录 `acceptance_8ae7958f-be0b-4cd6-9e62-9b8d1e9eb7a4`，L1为 `SEMANTIC_MATCH`，账本变为 `2/18`，ReleaseIdentity保持不变。证据见 [`docs/evidence/platform/hengzhun-i10-live-e2e-17-revalidation-2026-08.md`](../../../docs/evidence/platform/hengzhun-i10-live-e2e-17-revalidation-2026-08.md)。

### P2：其余轻度案例

依次执行：

```powershell
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run L2 TEXT_ONLY
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run L2 TEXT_WITH_IMAGE
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run L3 TEXT_ONLY
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs run L3 TEXT_WITH_IMAGE
```

硬门槛：每条均独立通过，L1-L3三组语义对均完成，累计 `6/18`。任一条失败即停止P2剩余项。

2026-08-04实测结果：四条命令均退出码0；L2/L3文字与图片记录均为当前身份的不可变`PASSED`，L1-L3均为`SEMANTIC_MATCH`，账本从`2/18`变为`6/18`，ReleaseIdentity与source/deployed Hash保持不变。证据见 [`docs/evidence/platform/hengzhun-i10-live-e2e-17-revalidation-2026-08.md`](../../../docs/evidence/platform/hengzhun-i10-live-e2e-17-revalidation-2026-08.md)。

### P3：中度案例

依次执行 M1、M2、M3 的 `TEXT_ONLY` 和 `TEXT_WITH_IMAGE`。硬门槛：每条均独立通过，累计 `12/18`，M1-M3三组语义对完成。

2026-08-04执行结论：P3未完成。M1文字/图片、M2文字/图片和M3文字链产生了5条原始`PASSED`记录；M3图片链在`MIDSCENE_LOCATE`阶段以`I10_MIDSCENE_LOCATOR_MISMATCH`失败，任务为`buildjob_4205f178-9d7d-49f6-a994-38add3c26f48`，旅程为`journey_e71e5b56-fdc4-4bb3-b275-1e1ce3858fc3`。

失败后的执行计划审计发现确定性编译器缺陷：`fuxing-bank-demo`适配器绑定会把文档、账户、消息、收款人等非登录案例错误编译为固定的`LOGIN_PROFILE`动作集。M3文档查询草案因此被错误转换为包含`HEADER_DISPLAY_NAME`、`HEADER_AVATAR`和个人资料比较的14步登录模板。该缺陷同时影响此前非L1链路的业务语义可信度：旧身份下账本原始计数虽达到`11/18`，但只有L1文字/图片两条可继续视为与业务意图一致的可信证据；L2、L3、M1、M2及M3文字记录保留为不可变历史事实，不得用于完成声明。

源码已修正为仅在语义同时包含个人资料/个人中心、头像、姓名和一致性比较时选择登录模板；其他绑定复兴银行适配器的案例保持`GENERIC_WEB`。同时修复Stage8把“作者化失败”误报为`I10_STAGE8_SCHEDULE_TERMINAL_MISSING`的问题。构建与57项聚焦测试通过。构建后检查器计算出的文件系统身份已漂移为`2a173f90b9b915e20df3eb1a68cd134a3ded9b76d1916c0c8a54ae20fe51df51`，旧身份18条全部归入历史集合，当前为`0/18`；受管Worker文件集Hash仍不一致，公共API回读证据已过期。当前处于重载前过渡态，尚未形成可验收的新ReleaseIdentity，因此P3不能继续、不能进入P4。

### P4：重度案例

依次执行 H1、H2、H3 的 `TEXT_ONLY` 和 `TEXT_WITH_IMAGE`。硬门槛：

- 普通登录和非验证步骤不得误触发U盾。
- 转账已直达单号页时必须跳过验证。
- 进入网页验证页时只允许受控的持久化U盾网页确认，并以路由、DOM和业务单号三类证据确认成功。
- 原生窗口、PIN、OTP、验证码或无交互桌面不得被伪装成自动通过。
- 累计达到 `18/18`，H1-H3三组语义对完成。

### P5：最终收口

执行：

```powershell
& '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-acceptance-ledger-v3.cjs status
& 'C:\Users\fujunye\.codex\skills\hengzhun-i10-regression\scripts\inspect-i10.ps1' `
  -Root 'D:\Agent\banksystem\platform\hengzhun-regression-system' `
  -CompareSnapshot 'C:\tmp\i10-live17-before.json'
cmd /d /c VERIFY.cmd --no-pause
```

完成谓词：

```text
exit = 0
releaseIdentity.identityHash = 6a1fd9a7d44086e6dcb29fa7cc23382712a61d103868f14f1e2f44c754b3a687
after.currentPassed = 18
after.required = 18
ledgerDelta = +17
historical evidence was not promoted
all 9 text/image pairs are semantically equivalent
full18ChainAccepted = true
```

只有满足上述机器谓词，才可获得 `I10_FLOWISE_18_CHAIN_ACCEPTED`。`VERIFY.cmd`通过只证明包完整性，不能代替LIVE_E2E。

## 6. 失败、恢复和停止规则

- 每条命令非零退出时，保存其运行目录、第一失败边界、安全错误码和阶段耗时，停止后续案例。
- 仅对已分类的瞬态失败进行有限重试，并保持同一幂等键；同类失败连续三次后停止，不盲目重跑。
- 有合法运行目录且权威状态支持恢复时，使用：

  ```powershell
  & '.\runtime\node-v20.20.2-win-x64\node.exe' .\scripts\i10-18-chain-acceptance-live.cjs recover <case> <variant> <run-directory>
  ```

- 不得通过删除失败记录、改写SQLite、修改账本、放宽断言或跳过2×2来恢复。
- 任一身份漂移立即终止整次补验；已完成的新记录保留为其原身份事实，但不再继续累加到本任务完成口径。
- 发现确定性代码缺陷时，停止验收并另建修复任务。修复、重新发布或重启代码将生成/重新核对ReleaseIdentity，不能在本包内边跑边改。

## 7. 证据与报告

执行证据至少包含：

- 执行前/后检查器快照及身份比较结果。
- 17条命令、退出码、recordId、案例/变体、运行目录、阶段耗时和终态。
- 每条候选包、脚本Hash、四次稳定性Run ID、激活决策、正式Run或Schedule、结果收件箱和Artifact引用。
- 9组文字/图片语义等价结论。
- 首个失败边界（如有）与未执行余项。
- 账本从 `1/18` 到 `18/18` 的同身份增量，不复制历史测试数字作为结论。

证据索引建议落在：

```text
docs/evidence/platform/hengzhun-i10-live-e2e-17-revalidation-2026-08.md
```

## 8. 回滚点与下一门槛

本任务不修改产品代码，因此不存在源码切流回滚。运行态回滚只允许停止本包拥有的当前任务/受管服务，不删除不可变验收事实，不终止未知进程。

下一阶段：**另行批准并执行“适配器路由修复、受管重载与新ReleaseIdentity重基线”任务**。该任务必须先加载已验证的修复、完成Flowise公共API回读并冻结新身份，再从P0/P1开始重跑至P3；同一新身份获得12条可信记录之前不得进入P4。

## 9. 2026-08-04 停止状态覆盖

用户已明确要求停止继续运行并快速收口。当前任务保持`STOPPED_ON_FIRST_FAILURE`，不得自动恢复剩余17链。

```text
currentReleaseIdentity = 4848b65aa8bad2305acfba8742d3ecb2f2703de1f45884b5c54aa256050d6eaf
currentPassed = 0/18
historicalStale = 29
firstFailedGate = L1 TEXT_ONLY / 2x2 stability
firstError = CANDIDATE_ROUTE_NOT_ALLOWLISTED
secondaryControlDefect = terminal VALIDATION_FAILED treated as preview pending
```

本任务没有获得P3关闭、P4启动或`I10_FLOWISE_18_CHAIN_ACCEPTED`。后续只能以新的、单独批准的小任务修复候选路由解析与终态感知轮询；修复后从L1文字/图片双链重新建立同身份证据，禁止直接续跑M1-M3或重度案例。

## 10. 2026-08-24 新身份首次执行停止状态

用户授权 `HENGZHUN-I10-LIVE-E2E-17-REVALIDATION-001` 执行 managed reload、Flowise 私有发布与公共 API 回读、冻结新 ReleaseIdentity，并依次运行 L1 两个变体，要求首次确定性失败立即停止。实际执行结果：

```text
frozenReleaseIdentity = 02ae6b18ed678415488db431f1c271ec258ec6475a1414864731d495a8d81dc4
managedRuntimeBeforeAcceptance = HEALTHY / businessReady=READY
publicReadback = FRESH
releaseAlignedBeforeAcceptance = true
currentPassed.before = 0/18
firstAttempt = L1 / TEXT_ONLY
firstError = I10_ACCEPTANCE_BROWSER_OCR_EVIDENCE_INVALID
currentPassed.after = 0/18
identityAfterFailure = 02ae6b18ed678415488db431f1c271ec258ec6475a1414864731d495a8d81dc4
TEXT_WITH_IMAGE = NOT_RUN
managedRuntimeAfterRollback = NOT_RUNNING
```

非敏感元数据复核把原因唯一化为证据身份过期：现有 Browser/OCR 套件为真实 `PASSED`、`mock=false`、`degraded=false`、9个案例且 L1 浏览器/OCR制品完整，但它绑定身份 `b514f9d8b55ce623ec210cc11c448d385aa048d6ec7a4311ef60ccdd6a373738`，不能复用于当前冻结身份。验收驱动器在进入 Flowise 业务链前正确 fail closed。

下一硬门不是修改或迁移旧证据，而是取得一次新的明确授权：重启同一源码身份，复核公共回读后启动隔离受控门户，生成仅 L1 的同身份 Browser/OCR 前置证据，再从 L1 `TEXT_ONLY` 重试。任何确定性失败仍立即停止；P2-P5仍未授权。
