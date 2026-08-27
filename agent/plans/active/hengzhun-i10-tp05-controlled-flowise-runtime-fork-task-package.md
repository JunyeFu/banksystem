# Hengzhun I10 TP-05：受控 Flowise Runtime Fork 与有效依赖闭包

## 状态与边界

- 状态：`COMPLETE`（2026-08-24 独立复核）
- 前置（实施时）：TP-04 为 Flowise 提供独立 Node 24；当时 TP-03 仍因上游整包的 peer-invalid 与无修复 `decompress` Critical 保持 `BLOCKED`。2026-08-24 TP-03 已以后续 fail-closed stub 方案完成。
- 允许面：受控 fork policy、可复现裁剪器/校验器、Flowise runtime acquisition metadata、I9 PREPARE/lifecycle、Stage9 SBOM/manifest、ReleaseIdentity、聚焦行为测试和任务控制文件。
- 禁止面：正式服务、正式 `.data`、Flowise 发布、Agentflow 重建、验收账本、风险接受和 LIVE_E2E。

## 业务常识与不变量

1. `DISABLED_NODES` 不是供应链隔离：Flowise 3.1.4 的 NodesPool 在判断 disabled 之前会 `require(file)`，所以禁用节点仍可执行顶层依赖。
2. 上游获取锁与可发布运行时闭包是两份不同证据：前者证明来源可复现，后者证明实际装运的文件、组件入口和第三方包边界。
3. 裁剪只能发生在精确版本、精确 acquisition lock 和已验证 overlay 之后；未知上游字节必须 fail closed，不能“尽力删除”。
4. I10 只允许权威图所需的七个 AgentflowV2 节点、`chatOpenAI`、`customMCP` 和 `openAIApi` credential。动态模型/工具入口必须显式列入 policy。
5. 无修复 Critical 的关闭条件是其包在可发布树中物理不存在，且保留入口的静态闭包不再引用它；仅写 audit exception 不算关闭。
6. 每次 `npm ci` 会恢复上游整包；PREPARE 必须先执行受控 overlay，再原子生成/验证 runtime fork，生命周期不得启动未裁剪树。
7. policy、builder、runtime metadata、PREPARE、Stage9 与 ReleaseIdentity 必须同时变化，旧验收证据不能跨 fork 复用。
8. 本包建立 `STATIC/CONTRACT/INTEGRATION` 证据，不建立发布态或业务 `LIVE_E2E` 证据。

## 项目易错点

- 把 309 个 `DISABLED_NODES` 当成 309 个包都不可达，而忽略 require-before-filter。
- 直接修改 `node_modules` 后不留下重建器、上游锁哈希和 retained-file manifest。
- 先裁掉 overlay patch point，导致第二次 PREPARE 无法幂等执行。
- 只删 `officeparser`，却把其 Critical 传递依赖 `decompress` 留在发布树。
- 用陈旧的 `flowise/runtime-package-lock.json` 3.0.12 生成 SBOM，而实际 app 已是 3.1.4。
- 让 Stage9 从 acquisition lock 声称“全部装运”，或从 runtime manifest 漏掉实际保留包。
- 用源锁的 peer-invalid 数量替代有效入口闭包校验，或者反过来隐瞒源锁仍然存在的上游债务。

## 完成谓词

```text
before:
  identityHash=901d2022ec660aa38797f3053a9d5edde95db39df6c29868d3a6edd3e841d724
  sourceAudit=8 critical / 36 high / 98 moderate / 17 low
  sourceNpmLsProblems=14
  runtimeMetadata=3.0.12 (stale)

commands:
  <node20> --test scripts/verification/flowise-runtime-fork.test.cjs
  <node20> scripts/i10-build-flowise-runtime-fork.cjs check
  <node24> scripts/i10-flowise-runtime-probe.cjs
  <node20> scripts/i10-stage9-portable.cjs preflight --report-only

pass:
  exact upstream trio and acquisition-lock hash are verified before mutation;
  runtime node loader can see exactly the nine governed node names;
  credential loader can see only openAIApi;
  retained relative-import closure has zero unresolved files;
  prohibited Critical packages officeparser and decompress are physically absent;
  every removed package is absent and unreferenced by the retained closure;
  runtime fork manifest binds policy hash, acquisition lock hash and retained file hashes;
  PREPARE is idempotent and refuses an unverified partial fork;
  Stage9 packages the effective runtime manifest and reports the acquisition lock separately;
  ReleaseIdentity changes; publication state and acceptance ledger do not.
```

源 acquisition audit/peer-invalid 保持单独报告；只有“实际发布树已裁掉且入口闭包不可达”的项才能从 runtime 阻塞中解除，不能改写上游源事实。

## 具体实现模板

```json
{
  "schemaVersion": "hengzhun-i10-flowise-runtime-fork-policy-v1",
  "upstream": { "flowise": "3.1.4", "flowise-components": "3.1.4", "flowise-ui": "3.1.4" },
  "allowedNodeEntries": ["dist/nodes/chatmodels/ChatOpenAI/ChatOpenAI.js"],
  "allowedCredentialEntries": ["dist/credentials/OpenAIApi.credential.js"],
  "removedPackages": ["officeparser", "decompress"]
}
```

```js
const source = verifyExactAcquisitionLock()
const closure = resolveRelativeRequires(policy.allowedNodeEntries)
assertNoUnresolved(closure)
applyOverlaysBeforePruning()
promoteDeterministicFork({ source, closure, removedPackages: policy.removedPackages })
verifyRuntimeForkOrFailClosed()
```

```js
const effective = readRuntimeForkManifest(candidateRoot)
sbom.addComponents(effective.packages)
sbom.properties.push({ name: 'hengzhun:flowiseAcquisitionLockSha256', value: effective.acquisitionLockSha256 })
```

## 回滚

- 源码回滚必须同时撤回 policy、builder/verifier、PREPARE/lifecycle、Stage9、ReleaseIdentity、runtime metadata 与测试。
- 生成树回滚只允许在 `flowise/app` 执行精确 `npm ci` 恢复 acquisition lock；不得删除 `.data`、runtime、浏览器、模型或用户证据。
- 若 fork check 失败，保持服务未启动；不得自动回退到未裁剪的上游整包。

## 进入 REVIEW 的证据

- 3.1.4 acquisition lock 镜像 SHA-256 为 `b2242f36617ad1aedd75d563d5d181e7e345f05eb2ba789623bc34df38ca39e5`；runtime metadata 已从陈旧 3.0.12/Node20 校正为 3.1.4/Node24。
- runtime fork closure 为 `257ba5b891b886f64c0455a05f7dc23bfd363b91aca84095e261cfc5bae65932`：物理包 3087、保留入口直接可达包 63、可达 peer 冲突 0、相对 import 未解析 0。
- `officeparser`、`decompress`、`llamaindex`、`couchbase` 与 `@mem0/community` 已从有效树物理移除；PowerPoint、Llama evaluation、Arize instrumentation 和 Google follow-up 的非治理分支显式 fail closed。
- Node24 实际 NodesPool 回读恰为 9 个治理节点，credential 恰为 `openAIApi`；`better-sqlite3` 与 `sqlite3` 内存 SQL 同时 READY。
- Stage9 preflight 的 runtime trees/source files/host tools 均无缺失，fork READY 且 acquisition lock 镜像一致；只因受保护脏工作树返回 `BLOCKED_SOURCE_NOT_FROZEN`，没有创建候选、归档或发布。
- build、typecheck、163 文件 syntax gate、72/70/2 测试清单及完整 CI 注册套件 `491/491` 通过；TP-00 库存为 199 路径、unknown 0、overlap 0。
- ReleaseIdentity 从 `901d2022...` 变为 `369b91468e9c0d4a064909cda81effeda6be8002e59ef0205ab5f0637e9d35d2`，并补入 MCP 可执行合同；release code set 为 152 文件。
- 源 acquisition audit 仍为 8 critical / 36 high / 98 moderate / 17 low，且旧 exception fingerprint 对 `decompress`、`flowise-components`、`llamaindex` 已漂移。该源门保持红色并等待独立风险/升级决策；本包只证明装运 runtime 的 Critical 链物理缺失与治理入口不可达。
- 本包没有启动正式服务、读取正式数据、发布 Flowise、重建 Agentflow、写验收账本或执行 LIVE_E2E。

## 独立完成复核

- 当前 fork check 为 `READY`，closure 为 `095fa54557a62a3d9d7e3fd95c1be35b6c4bf34a5611c59e468fa248d2af09ad`；14 个治理 node file、1 个 credential file，所有 policy 移除包均保持物理缺失。
- Node24 NodesPool/native ABI 读回与隔离 acquisition VerifyOnly 均为 READY；Stage9 将 acquisition provenance 与有效 runtime closure 分证，且未生成导出物。
- 完整注册套件 `504/504`，当前 ReleaseIdentity 为 `b5db9201bc03e53f2f48361be7eb52fdc9eaaf364b689a59f4dc53a41b29c5eb`。
- 本包只关闭可装运 runtime fork；原始 source/lock audit 由 TP-03 管理，并已于 2026-08-24 达到 0 High/Critical 后完成。
