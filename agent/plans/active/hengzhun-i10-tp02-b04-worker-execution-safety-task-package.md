# Hengzhun I10 TP-02：B04 Worker 执行安全审查与验证

## 状态与边界

- 状态：`COMPLETE`（2026-08-24 独立复核）
- 前置：TP-01 已完成；TP-02 开始时源码计算身份 `eccd00de2e732b72d539167c3237eafdf4fdf55fc065cb06cacbea98d6d9a452`，正式账本 `0/18`。
- 允许面：Worker 源码、WorkerCodeSet、lease/artifact/screenshot/target 行为测试、ReleaseIdentity Worker 投影，以及任务控制文件。
- 禁止面：正式 `.data`、主库 artifact 内容核查、Flowise 发布、运行时重载、Fineract/PostgreSQL、LIVE_E2E 和历史账本改写。

## 业务不变量

1. claim、renew、complete 必须携带同一 `taskId + workerId + leaseVersion`；过期或被重领的 Worker 不得发布制品或覆盖新执行。
2. Worker 必须在租约冲突或本地已知 lease deadline 到达时停止浏览器动作；不能只在执行结束时才发现租约失效。
3. 续租成功必须更新本地 deadline；瞬时传输错误可在原 deadline 内重试，但不得把 deadline 无限延长。
4. 制品只能隐藏 staging，服务端在同一 fenced 事务中发布数据库行、最终文件和终态；失败必须回滚本次 staging/最终文件。
5. 未经完整、可证明脱敏的任何页面截图统一为 `QUARANTINED`；`REDACTED` 只允许结构化报告、无敏日志和真正的派生脱敏图。
6. Worker 在浏览器启动前重验已确认 DNS/IP 分类，并使用 Chromium host resolver pin；DNS rebinding 必须 fail closed。
7. WorkerCodeSet 必须等于入口静态 import 闭包，任何执行依赖变化都必须改变 WorkerCodeSet 和 ReleaseIdentity。

## 项目易错点

- heartbeat 吞掉网络错误，旧 Worker 在 lease 过期后继续产生业务动作。
- 只在 complete API fencing，忽略执行期间重复副作用。
- heartbeat 冲突后仍调用失败 completion，制造第二个过期写请求。
- 文件先进入可见目录，再做 ownership 检查。
- 局部 mask 后把整页截图标成 `REDACTED`。
- Worker 新增 import 未登记到 WorkerCodeSet，旧进程仍被判 current。
- system Node 加载项目 native module，得到伪环境失败。

## 完成谓词

```text
before:
  identityHash=eccd00de2e732b72d539167c3237eafdf4fdf55fc065cb06cacbea98d6d9a452
  workerCodeSetHash=4ecf702db483ff885c3d50b0217cc77ab6476186603831e692d048c5d0ef4852
  workerCodeSetFileCount=25
  currentPassed=0/18
  runtime=UNAVAILABLE

commands:
  <bundled-node> scripts/i10-worker-code-set-audit.cjs
  <bundled-node> --test \
    scripts/verification/worker-lease-scheduler.test.cjs \
    scripts/verification/screenshot-quarantine.test.cjs \
    scripts/verification/target-resolution-pinning.test.cjs \
    scripts/verification/midscene-diagnostics.test.cjs \
    tests/i10-release-identity-worker-set.test.cjs \
    scripts/verification/release-toolchain-integrity.test.cjs

pass:
  build/typecheck/lint/test-manifest exits are 0;
  a conflict or local deadline aborts the active browser executor with WORKER_LEASE_CONFLICT;
  a successful renewal re-arms only the server-returned deadline;
  stale completion cannot publish rows or files;
  every raw Worker screenshot envelope is QUARANTINED;
  Worker import closure equals the 25-file manifest and changes alter identity;
  currentPassed remains 0 and old identity evidence is not reused;
  no managed runtime, publication or LIVE_E2E is started.
```

证据等级：Worker helper/runner 行为为 `CONTRACT`；临时 SQLite fencing 与 Worker→Harness 投影为 `INTEGRATION`；本包不建立 `LIVE_E2E` 或上线证据。

## 实现模板

```js
const heartbeat = startRunLeaseHeartbeat(claim, { post, workerId })
try {
  const result = await executor(claim, env, { signal: heartbeat.signal })
  heartbeat.assertCurrent()
  await complete({ taskId: claim.taskId, workerId, leaseVersion: claim.leaseVersion, ...result })
} catch (error) {
  if (error.code === 'WORKER_LEASE_CONFLICT') return // 不再发送 stale completion
  throw error
} finally {
  heartbeat.stop()
}
```

```js
// raw/full-page/browser failure screenshots are not assumed redacted.
artifact('SCREENSHOT', 'image/png', 'QUARANTINED', 'png', bytes, {
  captureContext: 'FAILURE',
  downloadable: false
})
```

## 回滚与残余风险

- Worker 源码、WorkerCodeSet 和身份投影必须原子回滚；不得只回退 manifest。
- 不删除任何最终 artifact、历史证据、数据库或用户文件。
- TP-01 发现的共享 artifact 根历史完整性风险仍需授权运维只读核查；TP-02 测试不得访问该根。

## 进入 REVIEW 的证据

- 受管 Node：`v20.20.2`；`npm run build` 退出码 0。
- Worker import graph：25 个治理文件、未解析依赖 0；最终 `workerCodeSetHash=33df4b7db49b124a43d24bb659db17565f817baaa9fe57baf45b05b9c110b3c7`。
- Worker lease/artifact/screenshot/target/Midscene/identity/toolchain 聚焦矩阵：`52/52`，退出码 0。
- heartbeat 行为覆盖：不可并发续租、服务端续租响应严格重验、成功续租重置 deadline、传输失败不延长 deadline、本地到期触发 `WORKER_LEASE_CONFLICT` 并关闭浏览器。
- 三个受控适配器和 generic/stability runner 的原始或局部遮罩截图均为 `QUARANTINED`；结构化报告/无敏日志保持 `REDACTED`。
- 三个受控适配器统一消费 Harness 注入的进程内 DPAPI 解析凭据，不要求新 Journey 回退历史环境 alias。
- `npm run typecheck`、`npm run lint`、`npm run check:tests` 均退出 0；测试清单保持 71 registered / 69 CI / 2 runtime。
- inspector 前：`identity=eccd00de2e732b72d539167c3237eafdf4fdf55fc065cb06cacbea98d6d9a452`、Worker hash `4ecf702d...`、`0/18`。
- inspector 后：`identity=4232dc7fc7fc0c4bf1a0645b7ce5a9bbfa31705b7df4a2744d6312a08280abd2`、Worker hash `33df4b7d...`、`0/18`；Flow source/deployed Hash 未变化，旧证据未复用。
- 运行时仍为 `UNAVAILABLE`、`releaseAligned=false`；本包未启动发布或 LIVE_E2E。

## 独立完成复核

- 当前 Worker import graph 为 25 个治理文件、未解析依赖 0，`workerCodeSetHash=33df4b7db49b124a43d24bb659db17565f817baaa9fe57baf45b05b9c110b3c7`。
- TP-01/02 共享聚焦矩阵 `143/143`、最新完整注册套件 `504/504`；lease deadline/cancellation、fenced artifact、截图 quarantine、target pinning 和身份闭包均由行为测试覆盖。
- 最新 ReleaseIdentity 为 `b5db9201bc03e53f2f48361be7eb52fdc9eaaf364b689a59f4dc53a41b29c5eb`，账本仍为 `0/18`；未启动 Worker 或执行真实浏览器业务动作。
