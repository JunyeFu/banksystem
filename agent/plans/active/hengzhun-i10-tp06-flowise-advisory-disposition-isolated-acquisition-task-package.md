# Hengzhun I10 TP-06：Flowise Advisory 处置矩阵与隔离 Acquisition

## 状态与边界

- 状态：`COMPLETE`（2026-08-24）
- 前置：TP-05 runtime fork 为 `REVIEW`，闭包 `257ba5b891b886f64c0455a05f7dc23bfd363b91aca84095e261cfc5bae65932`；源码身份 `369b91468e9c0d4a064909cda81effeda6be8002e59ef0205ab5f0637e9d35d2`。
- 允许面：live npm audit 归一化、advisory→实际 runtime 路径/可达图连接、隔离 acquisition、install-script 白名单、native ABI 校验、原子提升、PREPARE/Stage9/ReleaseIdentity 与对应测试。
- 禁止面：自动签署风险接受、刷新 exception 伪造绿灯、正式服务、正式 `.data`、发布、Agentflow 重建、验收账本和 LIVE_E2E。

## 业务常识与不变量

1. npm audit 的包名级聚合不等于实际装运路径；同名包的不同嵌套版本必须按精确 node path 处置。
2. `RUNTIME_REACHABLE`、`RUNTIME_PRESENT_UNREACHABLE` 与 `ACQUISITION_ONLY` 是不同风险：第一类必须修复或移除入口，第二类应从装运树裁掉，第三类仍需隔离构建和人工风险决策。
3. `flowise-components`、`flowise` 等 aggregate finding 只有在所有 `via` 子项完成路径处置后才能关闭，不能因包名仍存在而全盘误报，也不能直接忽略。
4. acquisition 必须在新临时根执行 `npm ci --ignore-scripts`；只允许精确 native 包脚本在版本/锁/hash 校验后运行。
5. 未通过 audit disposition、fork check、Node24 NodesPool readback 和 native ABI 的 staging tree 不得替换当前树。
6. 提升只替换生成型 `node_modules`，失败恢复原树；不得触碰 `.data`、runtime、浏览器、模型或用户证据。
7. 风险接受是用户/安全责任人的决策；工具只能输出待签署项、到期日和证据，不能代签。

## 项目易错点

- 仅按 package name 判断 reachability，混淆根包和嵌套副本。
- 把 `flowise-components` aggregate Critical 当成其自身源文件存在直接 RCE，而不展开 `via`。
- `npm ci` 默认运行三方 install scripts，导致 acquisition-only 漏洞在构建阶段获得执行机会。
- 在正式 `flowise/app/node_modules` 原地试装，失败后留下半安装树。
- 只验证 `npm ls`，不验证 Node24 实际加载、SQLite ABI 和 fork manifest。
- 更新 exception fingerprint 后宣称漏洞修复。

## 完成谓词

```text
before:
  identityHash=369b91468e9c0d4a064909cda81effeda6be8002e59ef0205ab5f0637e9d35d2
  sourceAudit=8 critical / 36 high / 98 moderate / 17 low
  runtimeFork=257ba5b891b886f64c0455a05f7dc23bfd363b91aca84095e261cfc5bae65932

commands:
  <node24> scripts/i10-flowise-advisory-disposition.cjs
  <node20> --test scripts/verification/flowise-advisory-disposition.test.cjs scripts/verification/flowise-isolated-acquisition.test.cjs
  powershell -File scripts/i10-acquire-flowise-runtime.ps1 -VerifyOnly

pass:
  every high/critical audit node path has exactly one disposition and UNKNOWN=0;
  RUNTIME_REACHABLE critical=0;
  RUNTIME_PRESENT_UNREACHABLE high/critical=0 after deterministic pruning;
  acquisition-only findings remain explicit UNACCEPTED until a named decision exists;
  npm ci runs in an owned temporary root with ignore-scripts;
  only pinned native script packages may execute before atomic promotion;
  fork/readback/native ABI/Stage9/ReleaseIdentity gates pass;
  no formal service, publication, Agentflow build, ledger write or LIVE_E2E occurs.
```

## 实现模板

```js
for (const auditNode of vulnerability.nodes) {
  const runtimePath = normalizeAuditNodePath(auditNode)
  disposition = reachable.has(runtimePath)
    ? 'RUNTIME_REACHABLE'
    : physical.has(runtimePath)
      ? 'RUNTIME_PRESENT_UNREACHABLE'
      : 'ACQUISITION_ONLY'
}
```

```powershell
$staging = New-Item -ItemType Directory -Path (Join-Path $ownedTempRoot ([guid]::NewGuid()))
npm ci --ignore-scripts
# verify lock, versions and integrity; rebuild only exact allowlisted native packages
# apply overlays + fork + Node24 probe; then same-volume atomic promotion with rollback
```

## 回滚

- classifier/policy/test 可整体回退，不修改历史 audit 输出。
- acquisition staging 失败只删除本次自有临时根；promotion 失败恢复旧 `node_modules`。
- 不得以回滚为由恢复未裁剪 runtime 或删除用户数据。

## 落地结果（2026-08-24）

- live acquisition audit 仍为 `8 critical / 36 high / 98 moderate / 17 low`；44 个 high/critical finding 已逐 node path 分类为 `9 RUNTIME_REACHABLE / 0 RUNTIME_PRESENT_UNREACHABLE / 35 ACQUISITION_ONLY / 0 UNKNOWN`。
- aggregate finding 只继承同级或更高严重度的 `via` 子项处置，不再因 `flowise-components` 自身必然存在而误报可达 Critical。最终 `RUNTIME_REACHABLE critical=0`，acquisition-only 风险保持 `riskAcceptance=null`、`acquisitionRiskAccepted=false`。
- 受控 I10 runtime 明确退役 Lunary community callback、整文档上传和 S3/GCS/Azure storage provider；本地存储、九个治理节点、`openAIApi` credential 和 Node24 下的 `better-sqlite3/sqlite3` ABI 探针均通过。TP-06 完成时 fork closure 为 `3f5d81049711745942dc9039eff3944e07e38895b61766b618fa86aed8daf9b5`。
- 隔离 acquisition 使用同盘自有 staging、`npm ci --ignore-scripts`、精确 native allowlist、overlay/fork/readback/disposition 前置门和 rename+rollback 提升；`-VerifyOnly` 返回 READY，未执行正式 acquisition 提升。
- build、typecheck、166 文件 syntax gate、74/72/2 测试清单和受管 Node20 完整注册套件 `500/500` 通过；错误使用 PATH Node24 的一次运行因产品根 SQLite ABI 不匹配失败，按运行时合同重跑后全绿，未重装依赖。
- ReleaseIdentity 已绑定 classifier、acquisition policy/script、fork 和 Stage9；TP-06 完成时源码计算 identity 为 `2ca140e5116f041fe25a2cf4ab7ff0cb295ed90001b656400060497691aed431`。该身份未发布、未建立当前 LIVE_E2E 或 18/18 声明。
- TP-00 库存为 205 路径，`unknown=0`、`overlap=0`；未启动正式服务、未写正式 `.data`、未构建/发布 Agentflow、未改验收账本、未生成 ZIP。
