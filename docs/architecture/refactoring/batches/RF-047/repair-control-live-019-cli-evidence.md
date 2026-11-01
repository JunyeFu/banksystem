---
id: DOC-ARCH-RF047-LIVE019-REPAIR
title: RF-047 LIVE-019 根因确认与修复控制
document_type: repair-control
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-21
owner: Codex
---
# RF-047 LIVE-019 根因确认与修复控制

## 目的

修复当前 CLI Full18 在 `TEXT_ONLY` 链路上无法把已完成 Journey 识别为终态证据的问题；保持 Flowise 退出产品链路，Docker 与 Agent 服务持续运行。

## 已确认根因

1. `scripts/i10-18-chain-acceptance-live.cjs` 是历史 v3 驱动，仍调用 Flowise/public prediction 路径。它在当前 CLI 产品中得到 `fetch failed`，不能作为验证入口或回退路径。
2. 当前 CLI 的 `hz-agent evidence` 读取的是 Harness → MCP 的 Journey 投影。Harness 的 `interactionEnvelope()` 没有发布终态字段，且 `artifactCards()` 只读取 `references.artifactIds`，没有投影 `references.resultArtifactId`。因此一个已有 `status=COMPLETED`、带结果制品的 Journey 到 CLI 投影后变成 `terminal=false`，结果制品也不在卡片中，触发 `AGENT_FULL18_JOURNEY_NOT_TERMINAL`。

## 修复范围

- 在 Harness 的权威 Journey 投影中：将结果制品加入 artifact cards；当 Journey 为 `COMPLETED` 且存在 `resultArtifactId` 时发布 `terminal=true`。
- 保留旧 v3 驱动和历史证据，仅明确其不属于当前 CLI 验证路径；不接入 Flowise、不增加 fallback/retry、不手工改写验收账本。
- 修改后重新生成 Harness 派生产物，重启仅 Agent 的 Harness/MCP/Worker 服务；不停止 Docker 银行服务。

## 冻结验证谓词

- 现行入口：`node20 scripts/i10-agent-full18-live.cjs run`。
- 旧身份 `908d842d...170a1b` 的确定性失败保留为历史，不续写为成功。
- 修复后必须生成新 ReleaseIdentity，从 L1 `TEXT_ONLY` 与 `TEXT_WITH_IMAGE` 重新建立证据，再验证 L2 `TEXT_ONLY`：CLI 返回 COMPLETED，evidence 的 `terminal=true`，包含 `resultArtifactId` 对应的 SHA-256 artifact card，v4 ledger 追加 PASSED 记录。
- 任一确定性失败立即停止该身份，仅保留失败证据并继续恢复服务。

## 机器验证

```powershell
node20 --check harness/src/i10/service.ts
npm run generate:dist
node20 scripts/i10-agent-lifecycle.cjs status
node24 agent-cli/bin/hz-agent.mjs evidence <completed-journey-id>
node20 scripts/i10-agent-full18-live.cjs preflight
```

预期：evidence 输出 `schemaVersion=hengzhun-cli-evidence-view/v1`、`status=COMPLETED`、`terminal=true`，且 `artifactCards` 包含 `references.resultArtifactId`。

## 修复后验证记录

- `npm run generate:dist`：通过。
- Agent-only Harness/MCP/Worker 重启：通过，`status=HEALTHY`，银行 Docker 服务未停止。
- 新身份：`ed344f8d773ce5c84c4e0b1164fcc674b6cd334643cd84e0f903b0833d83402f`。
- 对既有已完成 Journey 的 CLI evidence 回读：通过；返回 `terminal=true`，并包含 `art_8aec01b0-4834-4ed0-996a-b27325b4fa5a` 结果制品卡及 SHA-256。
- `agent-cli/test/offline-integration.test.mjs`：17/17 通过。
- `i10-agent-full18-live.cjs preflight`：READY。
- 新身份 L1 `TEXT_ONLY` 已通过并写入运行检查点；`TEXT_WITH_IMAGE` 执行期间外部进程被中断，检查点保持 `RUNNING`，因此未把 L1 或 Full18 宣称为完成，也未篡改检查点。

Full18 尚未宣称完成；新身份的 L1/L2 正式 LIVE 证据需从 L1 起点重新建立。

## 后续 LIVE 停止点

- 新身份 L1 两个变体均已通过并写入 v4 ledger。
- L2 `TEXT_ONLY` 首次正式执行在 Agent CLI 链执行阶段返回 `AGENT_FULL18_CHAIN_EXECUTION_FAILED`；v4 ledger 已写入 `FAILED_DETERMINISTIC` 检查点，验证按规则停止。
- 当前身份不得重跑或续写成功。Docker 银行服务与 Agent 三服务保持健康；下一步必须先读取该 CLI 调用的完整终端事件，确认具体执行失败原因后，再冻结新身份。

## L2 诊断补充

- 独立 CLI 诊断首次明确返回 `JOURNEY_ENTRY_URL_INVALID`：正式自然语言夹具缺少入口 URL。
- 补充入口 URL 后再次诊断返回 `JOURNEY_TARGET_SYSTEM_INVALID`：夹具还缺少 `目标系统：...`，同时合同要求 credentialRef。
- 已将完整 L2 夹具纳入 `agent-cli/test-fixtures/full18/L2-TEXT_ONLY.txt` 并加入 v4 ReleaseIdentity manifest，冻结新身份 `46b5ebda65c1ed03e8ef800bbb5584aa05e2111d3b5adf37990d6e5d406e585b`。
- 新身份 L1 重建在 `TEXT_ONLY` 阶段返回 `AGENT_L1_VARIANT_EXECUTION_FAILED`，已停止；该身份尚未产生有效 L1 证据或 Full18 通过结论。
