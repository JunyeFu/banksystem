# Hengzhun I10 TP-07：Runtime High Advisory 闭包

## 状态与边界

- 状态：`COMPLETE`
- 前置：TP-06 已完成，fork closure 为 `3f5d81049711745942dc9039eff3944e07e38895b61766b618fa86aed8daf9b5`；live disposition 为 `9 RUNTIME_REACHABLE / 0 RUNTIME_PRESENT_UNREACHABLE / 35 ACQUISITION_ONLY / 0 UNKNOWN`，可达 Critical 为 0。
- 允许面：advisory range 与物理版本精确连接；退役 I10 不使用的 legacy MultiAgent、外部 analytics、GeoIP telemetry、SMTP；必要的兼容升级；隔离 acquisition；fork/PREPARE/Stage9/ReleaseIdentity 与测试。
- 禁止面：自动签署 acquisition 风险、正式服务、正式 `.data`、Agentflow 构建/发布、账本写入、LIVE_E2E、ZIP、提交或推送。

## 业务常识与不变量

1. 同名包的不同物理版本不能共享一个 advisory 结论；直接 advisory 必须同时匹配 node path、安装版本和 range。
2. aggregate finding 必须沿实际父子可达链继承，不能让已裁掉的父包因另一路径上的同名 child 重新变成 runtime reachable。
3. I10 当前权威图是 `AGENTFLOW` V2；退役 legacy MultiAgent 不能改变当前图的执行路径，但必须以 fail-closed stub 和 Node24 readback 证明。
4. 外部 analytics、GeoIP telemetry、SMTP 和云存储不是本地银行回归的业务能力；禁用时应明确报错或返回空结果，不能静默降级到不受控网络。
5. 依赖变更只能通过隔离 acquisition 提升；不得在正式 `node_modules` 原地试装。
6. acquisition-only 风险继续由风险所有者决定；runtime High 清零不等于上游 source audit 清零。

## 项目易错点

- 用 vulnerability 顶层 range 代替每条 advisory 的精确 range。
- 只删 package 而保留顶层 `require()`，导致启动时仍执行漏洞包代码。
- 为去掉旧 MultiAgent 误伤当前 AgentflowV2 的 `executeAgentFlow` 分支。
- 用运行配置关闭 analytics，但仍让其包在模块加载阶段执行。
- 直接 override 跨主版本依赖而不验证 peer、Node24 加载和当前九节点。

## 完成谓词

```text
commands:
  <node24> scripts/i10-flowise-advisory-disposition.cjs
  <node20> scripts/i10-build-flowise-runtime-fork.cjs check
  <node24> scripts/i10-flowise-runtime-probe.cjs
  powershell -File scripts/i10-acquire-flowise-runtime.ps1 -VerifyOnly
  <node20> scripts/run-registered-tests.cjs run

pass:
  RUNTIME_REACHABLE high=0 and critical=0;
  RUNTIME_PRESENT_UNREACHABLE=0 and UNKNOWN=0;
  all remaining high/critical findings are ACQUISITION_ONLY and UNACCEPTED;
  active AGENTFLOW V2 and exact nine-node readback remain READY;
  fork, native ABI, PREPARE, Stage9 and ReleaseIdentity gates pass;
  no service start, publication, ledger mutation or LIVE_E2E occurs.
```

## 实现模板

```js
directAffected = physicalNode
  && semver.satisfies(physicalNode.version, advisory.range)
  && runtimeReachability.has(physicalNode.path)
```

```js
// Unsupported networked feature: preserve module shape, fail closed on use.
const DisabledProvider = class {
  constructor() { throw new Error('I10_FLOWISE_PROVIDER_DISABLED') }
}
```

## 回滚

- classifier range 精度、controlled patches、policy、lock 与 acquisition tree 作为一个批次回滚。
- promotion 失败必须恢复旧 `node_modules`；不得恢复已经证明不可达且被裁掉的危险分支。
- 不修改历史 audit、发布回读或验收证据。

## 落地结果（2026-08-24）

- 隔离 acquisition 已完成同盘原子提升；当前 fork closure 为 `095fa54557a62a3d9d7e3fd95c1be35b6c4bf34a5611c59e468fa248d2af09ad`，随后 `-VerifyOnly` 复核为 `READY`。
- Node24 readback 为精确 9 个治理节点、`openAIApi` credential，以及 `better-sqlite3@12.11.1` / `sqlite3@5.1.7` native ABI；当前 `AGENTFLOW` V2 分支保持可加载。
- 当前原始 source/lock audit 是 `0 critical / 6 high / 81 moderate / 11 low`。6 个 governed finding 的有效处置为 `0 RUNTIME_REACHABLE / 0 RUNTIME_PRESENT_UNREACHABLE / 6 ACQUISITION_ONLY / 0 UNKNOWN`，reachable High/Critical 均为 0，风险接受仍为 `false/null`。
- source audit exception gate 在不刷新例外的条件下通过：47 个旧 finding 已解析，1 个 finding 仅单调降险；基线指纹篡改、新 advisory/node/via 或范围变化仍 fail closed。
- 受管 Node20 build/typecheck/syntax/test-manifest 与完整注册套件通过，注册测试为 `504/504`；发布图和 manifest 哈希在测试前后不变。
- 当前源码 ReleaseIdentity 为 `b5db9201bc03e53f2f48361be7eb52fdc9eaaf364b689a59f4dc53a41b29c5eb`，覆盖 156 个 release code-set 文件、25 个 worker code-set 文件和 39 个 migration。
- 未启动服务，未写正式 `.data`，未构建或发布 Agentflow，未写 acceptance ledger，未运行 LIVE_E2E，未打 ZIP、提交或推送。

## 剩余硬门

TP-07 只证明受控有效 runtime closure 不再包含 High/Critical 可达项。2026-08-24 TP-03 随后以 fail-closed 本地 stub 清除了最后 6 个 acquisition-only High，source/lock 达到 0 High/Critical，且实际保留闭包 peer 检查为 0；源码冻结前置已解除。managed reload、public readback 与 LIVE_E2E 仍需另行授权。
