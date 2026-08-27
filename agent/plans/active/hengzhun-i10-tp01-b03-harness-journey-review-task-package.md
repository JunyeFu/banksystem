# Hengzhun I10 TP-01：B03 Harness/Journey 合同审查与验证

## 状态与边界

- 状态：`COMPLETE`（2026-08-24 独立复核）
- 所有者：Codex
- 前置：TP-00 已进入 `REVIEW`，B03 文件集合已归属。
- 允许面：Harness、MCP、目标合同、迁移 037–039、B03 定向测试，以及任务控制文件。
- 禁止面：Flowise 图与发布、Worker 实现、正式 `.data`、Fineract/PostgreSQL、运行服务、LIVE_E2E、历史账本改写。

## 业务不变量

1. 一次执行必须绑定同一 `namespace + journeyId + confirmedDecisionEventId + preparationId + caseId + caseVersion + planId + candidateId`；不得按“同 case 最新记录”猜测 run 或 schedule。
2. 只有匹配已冻结 proposal payload 的决策事件才能创建 run/schedule；客户端 ID/hash 不能替代服务端重算。
3. `ONE_TIME` 必须持久化为 `RUN_ONCE_WITHIN_GRACE` 语义；到达 deadline 即记一次终态 misfire，不可因 mutex 无限迟到执行。
4. 迁移 037–039 必须在空白隔离 SQLite 上顺序应用到版本 39；已应用迁移只允许前向补偿，禁止删除或改写。
5. 目标探测必须先经用户确认，再逐跳执行 DNS/IP 分类和地址固定；浏览器启动前必须重验固定地址，拒绝 DNS rebinding。
6. Harness 是 Journey、幂等、SQLite 与执行绑定权威；MCP 只做受限表示归一化，不推断业务状态。

## 项目易错点

- 用 `case_id + created_at` 绑定另一个任务或计划。
- Journey 每次读取都轮换下载授权，导致只读查询产生副作用。
- 只比 proposalId/payloadHash，不从服务端冻结 payload 重算哈希。
- 将 `RUN_ONCE_WITHIN_GRACE` 降级为普通 `RUN_ONCE` 后在 grace 外执行。
- mutex 忙时不记录延迟状态，之后无限补跑。
- 目标 URL 只校验协议，不校验 DNS、CIDR、重定向和 rebinding。
- 直接运行 `npm run test:i10:journey`，隐式重建 Agentflow/发布清单。

## 完成谓词

```text
before:
  releaseIdentity.identityHash=b514f9d8b55ce623ec210cc11c448d385aa048d6ec7a4311ef60ccdd6a373738
  currentPassed=0/18
  runtime=UNAVAILABLE
  migrationVersion=39 (source-computed)

commands:
  npm run build
  <bundled-node> --test \
    scripts/verification/journey-state-machine.test.cjs \
    scripts/verification/mcp-interaction-contract.test.cjs \
    scripts/verification/context-envelope.test.cjs \
    scripts/verification/target-profile.test.cjs \
    scripts/verification/target-resolution-pinning.test.cjs \
    scripts/verification/harness-loopback-host.test.cjs \
    scripts/verification/rf001-contract-adapter.test.cjs \
    scripts/verification/rf002-s2-state-contract.test.cjs \
    scripts/verification/rf002-s3-mcp-convergence.test.cjs \
    scripts/verification/rf004-s3-harness-credential-resolution.test.cjs \
    scripts/verification/worker-lease-scheduler.test.cjs

pass:
  exit=0 for build and every focused test;
  all database fixtures use temporary isolated roots and close/remove them;
  exact wrong-Journey/wrong-preparation/unlinked-latest records fail closed;
  ONE_TIME deadline and migration 37 semantics are behavior-tested;
  target DNS resolution is pinned and rebinding is rejected;
  if product source is unchanged, after identity equals before;
  if a reviewed product fix is required, after identity changes explicitly while currentPassed remains 0 and old evidence is not reused;
  no managed runtime start, publish, acceptance-state mutation, or LIVE_E2E occurs.
```

证据等级：build/typecheck 为 `STATIC`；单进程临时 SQLite 行为为 `CONTRACT`；MCP→Harness 受限调用为 `INTEGRATION`。本包不赚取任何 `LIVE_E2E` 或上线标签。

## 具体实现模板

```ts
type ExecutionBinding = Readonly<{
  namespace: string
  journeyId: string
  confirmedDecisionEventId: string
  preparationId: string
  caseId: string
  caseVersion: number
  planId: string
  candidateId: string
}>

// 事务内：重验冻结事件和完整 tuple，再创建唯一 run/schedule。
db.transaction(() => {
  const binding = loadAndValidateDecisionBinding(input)
  assertExactTuple(binding, input)
  insertBoundExecution(binding)
})()
```

```sql
-- 迁移模板：新增字段 -> 回填 -> 约束/索引/触发器 -> 行为测试。
-- 已发布迁移不可原地修改；修复必须新增下一号前向迁移。
CREATE TRIGGER ...
BEFORE INSERT ON runs
WHEN NOT EXISTS (<同 Journey 冻结决策和业务 tuple 的权威连接>)
BEGIN
  SELECT RAISE(ABORT, 'I10_RUN_EXECUTION_BINDING_INVALID');
END;
```

## 回滚

- 本包仅审查和补强未发布源码时，可按明确 TP-01 路径整体回退。
- 迁移一旦在任何持久环境应用，不回删 037–039；使用新迁移前向补偿。
- 不删除运行报告、数据库、用户辅助文件或历史验收证据。

## 审查中发现的制品根错配事件

首次旧 RF 集成夹具虽使用隔离数据库，却未隔离 `HENGZHUN_ARTIFACT_ROOT`。Harness 启动恢复因此以测试数据库判断共享 artifact 根，错误地尝试清理对该数据库“未登记”的旧最终文件，并出现并发 `EPERM/ENOENT`。本包采取两层修复：

1. 两组进程级测试的数据库、备份、artifact、Flowise attachment/storage 全部迁移到 OS 临时根；
2. `ArtifactStore` 启动恢复只清理由自身协议创建且超过 24 小时的隐藏 `.pending`，最终文件无条件保留，后续若需 GC 必须由独立、授权、数据库绑定的任务完成。

该安全修复同时证明旧 ReleaseIdentity 的 Harness 集合漏掉 `artifact-store.ts` 等实际执行文件。为满足“B03 源码变化必须失效旧证据”，本包最小扩展 ReleaseIdentity 边界：递归包含全部 `harness/src/**/*.ts` 与对应 `dist/harness/src/**/*.js`，并用工具链测试验证闭包完全相等；不在本包处理其他 B06 发布工具问题。

仓库规则禁止本任务读取主数据库或制品内容，因此无法在本包内证明首次错误清理未影响历史最终文件。上线前必须由授权运维执行主库 artifact 记录与文件存在性的只读完整性核查；该残余风险不允许被测试绿灯覆盖。

## 进入 REVIEW 的证据

- 受管 Node：`v20.20.2`。
- `npm run build`：退出码 0。
- B03/Journey/目标/lease-grace 聚焦矩阵：`103/103`，退出码 0；其中两组进程级 RF 测试显式使用 OS 临时根，并断言迁移最高版本为 39。
- ReleaseIdentity 工具链：`6/6`，退出码 0；Harness 集合等于全部 `harness/src/**/*.ts + dist/harness/src/**/*.js`。
- `npm run typecheck`、`npm run lint`、`npm run check:tests`：退出码均为 0；测试清单为 71 registered / 69 CI / 2 runtime。
- inspector 前：`b514f9d8b55ce623ec210cc11c448d385aa048d6ec7a4311ef60ccdd6a373738`、`0/18`。
- inspector 后的源码计算身份：`eccd00de2e732b72d539167c3237eafdf4fdf55fc065cb06cacbea98d6d9a452`、`0/18`；Flow source/deployed Hash 未改变，未复用旧证据。
- 运行时仍为 `UNAVAILABLE`，公共 API 回读仍陈旧，本包没有建立部署或 LIVE_E2E 证据。
- 首个剩余阻塞：授权运维执行主库 artifact 记录与文件存在性的只读完整性核查；随后进入 B04 Worker 执行安全审查。

## 独立完成复核

- 当前受管 Node20 聚焦矩阵与 TP-02 共享复核共 `143/143`，最新完整注册套件 `504/504`；临时 SQLite 行为覆盖迁移 037–039、精确 Journey binding、ONE_TIME deadline、目标解析固定和 artifact 回滚。
- 最新 ReleaseIdentity 为 `b5db9201bc03e53f2f48361be7eb52fdc9eaaf364b689a59f4dc53a41b29c5eb`，migrationVersion=39，账本仍为 `0/18`。
- inspector 仍报告 runtime unavailable、public readback stale、releaseAligned=false；因此主库只读完整性核查仍是上线前运维项，但不阻止本代码/合同审查包完成。
