# Hengzhun I10 TP-03：B01 Flowise 供应链与安装态收口

## 状态与边界

- 状态：`DONE`（2026-08-24）
- 前置：TP-02/04/05/07 已完成；当前源码计算身份 `02ae6b18ed678415488db431f1c271ec258ec6475a1414864731d495a8d81dc4`，正式账本 `0/18`。
- 允许面：`flowise/app` 声明、锁文件、隔离安装态，Flowise 审计例外/门禁、I10 Flowise 运行策略及任务控制文件。
- 禁止面：正式 `.data`、Flowise 发布 API、运行时重载、Agentflow 生成、验收账本、Fineract/PostgreSQL 和 LIVE_E2E。

## 业务常识与不变量

1. 声明版本、lock 根依赖、实际安装三件套必须完全一致；只改 `package.json` 不构成升级。
2. Flowise 进程使用的 Node 主版本必须满足包的 `engines.node`；“能够安装”不代表受支持或可上线。
3. `npm audit` 的 high/critical 例外只能精确绑定 package、range、node path、via/advisory 和指纹，并必须自动过期；例外不是不可达性或安全证明。
4. 能安全覆盖的传递依赖应优先升级；跨主版本 override 必须有安装树和聚焦行为验证，不能只让 audit 数字下降。
5. I10 仅允许权威 Agentflow 实际引用的 Flowise nodes；关闭社区节点和未使用集成是攻击面约束，但不能抹去仍存在的依赖漏洞。
6. 依赖安装必须从 lock 可重复；`npm ls` 的 invalid/extraneous/missing 任一项都阻止候选上线。
7. 依赖或运行策略改变 ReleaseIdentity 时，旧验收证据只能保留为历史记录，不能继续计入 current。

## 项目易错点

- Flowise 3.1.4 已修复旧版 RCE，但其当前 npm engine 为 Node `^24`，与项目通用 Node 20 混用会形成受支持性缺口。
- override 只写 `tar@^7` 时，实际易受攻击的 `tar@6` 仍保留。
- 把新 advisory 直接追加到例外，不先检查是否已有安全补丁。
- 使用 system Node 生成 lock 或运行 native 模块，得到不可复现安装态。
- `npm audit fix --force` 可能把 Flowise 降级或跨主版本改写，不能作为自动修复方案。
- 关闭未使用 nodes 后宣称漏洞不可达；运行时加载、CLI、导入或未来配置仍可能改变可达性。

## 完成谓词

```text
before:
  identityHash=4232dc7fc7fc0c4bf1a0645b7ce5a9bbfa31705b7df4a2744d6312a08280abd2
  declared/locked/installed Flowise trio=3.1.4
  npm audit=9 critical / 45 high / 98 moderate / 14 low
  audit gate=FAIL (changed flowise-components, changed tar, new vm2)
  Flowise package engine=^24; project general runtime=v20.20.2

commands:
  <supported-flowise-node> <npm-cli> ci --ignore-scripts
  <supported-flowise-node> <npm-cli> ls --all --omit=dev
  <supported-flowise-node> scripts/check-flowise-audit.cjs
  <project-node20> --test scripts/verification/flowise-audit-gate.test.cjs scripts/verification/flowise-runtime-policy.test.cjs

pass:
  declared, locked and installed Flowise trio are identical;
  Flowise runtime Node satisfies the installed package engine;
  npm ls has no invalid, missing or extraneous package;
  every fixable high/critical dependency in scope is upgraded and verified;
  remaining high/critical findings exactly match an unexpired explicit risk register;
  runtime policy exposes only governed graph nodes and local storage;
  ReleaseIdentity delta is recorded and currentPassed remains 0;
  no managed runtime, publication, graph rebuild or LIVE_E2E is started.
```

证据等级：依赖树、审计和运行策略为 `STATIC/CONTRACT`；隔离启动与公共 readback 另属后续 `INTEGRATION`；本包不建立 `LIVE_E2E` 或正式发布状态。

## 具体实现模板

```json
{
  "dependencies": {
    "flowise": "<exact-version>",
    "flowise-components": "<same-exact-version>",
    "flowise-ui": "<same-exact-version>"
  },
  "overrides": {
    "<transitive-package>": "<verified-fixed-version>"
  }
}
```

```js
const actual = canonicalize(audit.vulnerabilities[name])
assert.deepEqual(actual, approvedException)
assert(Date.now() < Date.parse(approvedException.expiresAt))
// resolved findings may disappear; new or changed findings always fail closed.
```

```js
const supported = semver.satisfies(process.version, installedPackage.engines.node)
if (!supported) throw new Error('FLOWISE_NODE_ENGINE_UNSUPPORTED')
```

## 回滚与退出条件

- `package.json`、lock、审计例外、运行策略和测试作为一个批次回滚；不得只回退版本声明。
- 如果最新安全 Flowise 要求仓库尚未提供的 Node 主版本，则任务不得伪装完成：先落 fail-closed 兼容门并把“引入独立受管 Flowise runtime”作为上线硬门。
- 不执行 `npm audit fix --force`，不删除用户安装缓存、证据或运行数据。

## 当前收口证据与阻塞

- 声明、lock 根和安装态三件套均为 `3.1.4`；`tar` 已从实际易受影响的 `6.2.1` 升至 `7.5.22`，`vm2` 已从 `3.11.5` 升至 `3.11.6`。
- 实时 audit 从 `9 critical / 45 high / 98 moderate / 14 low` 降至 `8 critical / 36 high / 98 moderate / 17 low`；`tar` 和 `vm2` 已不再出现。
- audit 门继续 fail closed：新出现的 `decompress` Critical 当前 npm 最新仍为 `4.2.1` 且无修复版；`flowise-components` 与 `llamaindex` 指纹随实时 advisory 改变，未经风险所有者批准未刷新例外。
- 最新 Flowise `3.1.4` 的 npm engine 为 Node `^24`。运行策略在 Node 24 下通过并禁用 309 个未授权 nodes；现有受管 Node `20.20.2` 明确返回 `I10_FLOWISE_NODE_ENGINE_UNSUPPORTED`。
- 最新官方包安装树仍报告 14 个 upstream peer invalid，包括互相不兼容的 LangChain、React、officeparser 等约束；Flowise 私有 `better-sqlite3` 已为 Node24 升至 12.11.1，但未用其余跨主版本 override 伪造绿色 `npm ls`。
- 聚焦审计/运行策略合同测试 `7/7` 通过；证据等级为 `STATIC/CONTRACT`。
- 源码计算 ReleaseIdentity 从 `4232dc7f...` 变为 `d9f40cc201370e77338ed0ee3948ce954378825c44a0523a2eecfac1f956c4eb`；旧验收不得复用。

TP-04 已提供可打包的独立 Node 24 Flowise runtime 并通过 native SQLite 探针。TP-03 剩余两个解除阻塞条件：上游发布无 peer-invalid 的 Flowise 版本或批准维护受控 fork；风险所有者对无修复 `decompress` 及剩余精确指纹作不超过现有 2026-09-11 截止日的书面接受。完成前不得启动或发布该 Flowise 候选。

## 2026-08-24 当前复核

- 官方 npm registry 当前最新三件套仍为 `flowise@3.1.4 / flowise-components@3.1.4 / flowise-ui@3.1.4`，Flowise engine 仍为 Node `^24`；目前没有可直接升级的上游版本。
- 当前 source/lock audit 为 `0 critical / 6 high / 81 moderate / 11 low`。6 个 high governed finding 在受控 fork 中全部为 `ACQUISITION_ONLY`；有效 runtime 为 `0 RUNTIME_REACHABLE / 0 RUNTIME_PRESENT_UNREACHABLE / 0 UNKNOWN`。
- source audit exception gate 已在不刷新基线的前提下通过：47 个旧例外已解析，`flowise-components` 从 Critical 降为 High 且 nodes/via/advisory 仅缩小，被计为 1 个 monotonic reduction；任何新增或范围扩大仍 fail closed。
- 当前生产候选 `node_modules` 是策略裁剪后的有效 runtime，普通 `npm ls` 会把有意移除的 acquisition 包报告为 missing/extraneous；该结果不能替代隔离、未裁剪 acquisition tree 的 peer-closure 证据。
- 隔离 acquisition 使用 `npm ci --ignore-scripts`，只允许精确重建 `better-sqlite3@12.11.1` 与 `sqlite3@5.1.7`，提升后 fork closure 为 `095fa54557a62a3d9d7e3fd95c1be35b6c4bf34a5611c59e468fa248d2af09ad`。
- 未裁剪 acquisition tree 的真实 `npm ls --all` 仍有 20 个 upstream peer-invalid；其中本轮新增冲突只属于随后被裁掉的非治理分支，但验收合同不允许用修改 peer 声明伪造绿色安装树。
- TP-03 因此仍保持 `BLOCKED`：代码侧 Critical 和可达风险已清零，但剩余两个无修复直接 High（`extract-zip@2.0.1`、`xlsx@0.18.5`）的限时风险决定及上游 peer closure 仍未满足。

### 风险所有者决策模板

```yaml
decision: ACCEPT_UNTIL | REJECT_AND_WAIT_UPSTREAM
owner: <具名安全/发布责任人>
decidedAt: <ISO-8601>
expiresAt: <不晚于例外截止日>
scope:
  acquisitionLockSha256: <精确锁摘要>
  governedFindingCount: 6
  runtimeForkClosureHash: 095fa54557a62a3d9d7e3fd95c1be35b6c4bf34a5611c59e468fa248d2af09ad
conditions:
  ignoreScripts: true
  nativeScriptAllowlist: [better-sqlite3@12.11.1, sqlite3@5.1.7]
  runtimeReachableHighCritical: 0
rationale: <为何在截止日前接受或拒绝>
```

默认及当前决定为 `REJECT_AND_WAIT_UPSTREAM`；没有具名、带截止日且绑定精确 lock/fork 的记录时，source freeze、managed reload 和 LIVE_E2E 必须继续阻塞。

## 2026-08-24 最终收口

- `extract-zip` 与 `xlsx` 已改为仓库内 fail-closed 同名 stub；stub 明示并非上游发行版，任何调用分别抛出 `I10_FLOWISE_EXTRACT_ZIP_DISABLED` 与 `I10_FLOWISE_XLSX_DISABLED`。隔离 acquisition 会复制 stub、`npm ci --ignore-scripts`，且只重建 `better-sqlite3@12.11.1`、`sqlite3@5.1.7`。
- source/lock 实时审计为 `0 critical / 0 high / 82 moderate / 11 low`，High/Critical 精确发现数为 0；审计例外门把既有 53 项全部识别为已解析，未新增风险接受。
- 受控 runtime fork 为 `READY`，`closureHash=8be1c36a094046b4d2c834a8e287f66a44a50c46a2d7178b87f132ad11fb6144`，`reachablePeerIssues=[]`。普通 `npm ls` 不用于物理裁剪后的树，因为完整 acquisition lock 中有意移除的包会被 npm 报为 missing/extraneous；上线判据由 fork manifest 的实际保留闭包、包身份、静态 import、peer 检查和物理文件集合共同替代，避免伪改上游 peer 声明。
- 同盘原子 acquisition/promotion 返回 `READY`；Node `24.19.0` 探针读取精确 9 个治理节点、唯一凭据 `openAIApi`，并真实执行两种 SQLite 内存查询。聚焦供应链/运行时测试 `12/12` 与 ReleaseIdentity 工具链 `7/7` 通过。
- acquisition lock SHA-256 为 `473b5d48c6522be613d106848b11b498b2332ee56b40a5ff23f98218bffd4e94`；ReleaseIdentity 已纳入四个 stub 文件，当前 `releaseCodeSetFileCount=160`、`identityHash=02ae6b18...`，账本继续为 `0/18`。

TP-03 至此完成。该结论是 `STATIC/CONTRACT/INTEGRATION`，不代表 managed runtime 已重载、公共发布已回读或 LIVE_E2E 已通过；这些动作仍遵守任务包禁止面与另行授权门。
