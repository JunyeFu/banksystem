---
id: DOC-ARCH-RF001-B4-PLAN
title: RF-001-B4 切流阶段切片链规划
document_type: planning
domain: architecture
status: PROPOSED
authority: normative
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# RF-001-B4 切流阶段切片链规划

> 依据：v54 实施顺序条目 6（`RF-001-B4`：完成兼容、错误路径、18链身份保持和回滚验证后，才可申请切换、观察和关闭）；`cutover-runbook.md`（切换前置门禁）；`rollback-runbook.md`（回滚演练要求）；`contract-delta.md` B2 冻结决策。
> 本文件只定义 B4 切片链与顺序，不拥有全局排期权；任务状态以 `agent/backlog.yaml` 为准。

## 0. B4 切流内容（唯一变化轴）

RF-001 切流 = **MCP 错误响应从旧投影切换到 B2 冻结的 8 字段规范信封**：

```text
旧投影（现状，Flowise 可见）:  errorCode, category, status, validationIssues?
规范信封（B2 冻结，切流目标）: errorCode, category, status, retryable, userActionRequired, safeMessage, fieldErrors, correlationRef
```

不变项（B3 已落地，B4 只验证）：33 工具名、别名入口读取、Harness 权威字段、影子单请求、i3-customer 冻结绑定。切流只发生在 `hengzhun.mcp` 适配器边界，不修改 Flowise/Worker/SQLite/银行模块。

## 1. 切流前置硬门禁（cutover-runbook，全部满足才允许 S4 切流）

| 门禁 | 状态 | 归属切片 |
|---|---|---|
| 合同冻结（B2） | ✅ 已冻结 | — |
| 旧字段兼容测试全绿 | ✅ B3-S3/S4（30/30） | — |
| 影子结果等价（mismatched=0） | ✅ B3-S5（RUNTIME_SHADOW） | — |
| ReleaseIdentity 差异解释 + 18 链无回退 | ⛔ **未完成**（正式环境未启动） | B4-S2 |
| 回滚命令已演练 | ⛔ 未演练 | B4-S3 |

## 2. 切片链（顺序固定，前序未过不启动后序）

### B4-S1 兼容与错误路径基线验证（纯验证，零代码改动）
- 单功能点：MCP-33 兼容面与错误码语义的机器化核对
- 内容：工具名/别名/错误码清单与 `mcp-boundary-contract-v1.json` 交叉核对；错误路径测试矩阵（MCP 级 + Harness 级错误码逐一断言）；Flowise v7 消费者调用面静态核对（agentflow 工具名绑定）
- 产出：兼容核对表 + 错误路径矩阵证据（CONTRACT 级）
- done：聚焦测试全绿 + 核对表字段一致 + 文档校验

### B4-S2 18 链身份保持与公共 API 新鲜度回读（运行态，环境门禁）
- 单功能点：正式运行环境下 ReleaseIdentity 与 18 链验收的实时复算
- 内容：启动正式四服务（Flowise 3006/Harness 18788/MCP 18789/Worker）→ 公共 API 实时回读（FLOWISE_API_KEY，部署 Hash 与发布清单一致，关闭 OPEN 门禁）→ 18 链验收（`i10-18-chain-acceptance-live.cjs` 或等价实时复算）→ identityHash 复算对照
- **环境门禁**：正式环境不可用（模型密钥/Flowise 未启动）→ 登记确切原因+残余风险，B4 在 S2 处暂停，S4 切流不执行
- done：回读部署 Hash 一致 + 18/18 + identity 一致 + 证据新鲜

### B4-S3 回滚演练（运行态，隔离范围）
- 单功能点：按 `rollback-runbook.md` 演练回滚命令并验证恢复
- 内容：隔离运行态（复用 B3-S5 编排）制造受控触发条件（错误投影漂移/兼容失败）→ 执行回滚恢复 → 重跑 MCP 合同测试 + 身份比较 + VERIFY
- 产出：回滚演练记录（触发条件/命令/恢复证据）
- done：演练记录完整 + 恢复后测试全绿

### B4-S4 切流（代码切换，需用户显式批准）
- 单功能点：MCP 错误响应切换为规范信封（保留 `HENGZHUN_RF001_LEGACY_ERROR=1` 回退开关）
- 前置：B4-S1~S3 全过 + 用户显式批准切流（决策日志记录）
- 内容：`server.cjs` 错误路径改用 `projectCanonicalHarnessError`；影子比较保留（切流后新旧投影仍逐响应比较）；Flowise 可见错误形状变化（errorCode 权威名不变，新增恢复字段）登记为预期消费者变更
- done：聚焦测试（含新错误信封断言）全绿 + 隔离运行态影子回归 mismatched=0 + identity 不变 + 文档校验

### B4-S5 观察与关闭
- 单功能点：切流后观察窗口与批次关闭
- 内容：隔离运行态模拟正式流量观察（错误信封字段完整、无回归、影子 mismatch 持续 0）；观察证据收口；`batch.yaml` status `IMPLEMENTING → CLOSED`；v54 更新；RF-002 解禁登记
- done：观察记录 + 批次 CLOSED + 决策日志

## 3. 顺序与依赖

```text
B4-S1（兼容/错误路径基线）→ B4-S2（18链+新鲜度，环境门禁）→ B4-S3（回滚演练）
→ B4-S4（切流，用户显式批准）→ B4-S5（观察与关闭）
```

- S1 不依赖正式环境，可立即启动
- S2 依赖正式环境；不可用即暂停（如实登记，不绕过）
- S3 依赖隔离运行态（B3-S5 编排可复用）
- S4 依赖 S1+S2+S3 全过 + 用户批准
- S5 依赖 S4 完成后观察窗口

## 4. 预算与边界（每切片单独出任务包时细化）

- 每切片允许路径继续收窄于 RF-001 batch 范围；S1/S2/S3/S5 代码零改动（仅测试/文档/运行态产物）
- S4 唯一代码改动点：`mcp/src/server.cjs` 错误投影切换 + 回退开关
- 禁止：Flowise/Worker/SQLite/银行模块、工具名/别名变更、迁移、生产流量影子、未批准切流
- 公共 API 回读与 18 链验收属正式环境操作，需用户明确授权启动四服务

## 5. 待用户确认项

1. B4 切片链划分（5 切片）是否批准；
2. S2 环境门禁策略：正式环境不可用时暂停 B4（推荐）还是降级登记后跳过 S2 由用户在后续环境补验；
3. S4 切流内容确认：错误信封切换 + `HENGZHUN_RF001_LEGACY_ERROR` 回退开关。
