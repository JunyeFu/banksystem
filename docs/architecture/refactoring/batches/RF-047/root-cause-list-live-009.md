---
schemaVersion: rf047-root-cause-list/v1
releaseIdentity: 434466c57f23746d4197bf74734fb754d3428280252e55cb1633c2760dfa26a8
run: agent/runs/rf047/live-011
id: DOC-ARCH-RF047-LIVE009-ROOT-CAUSES
title: RF-047 LIVE-009 根因清单
document_type: root-cause-list
domain: architecture
status: ROOT_CAUSE_REPAIRED_OFFLINE_LIVE_PENDING
authority: normative
version: 1.0
effective_date: 2026-09-21
owner: Codex
---

# RF-047 LIVE-009 根因清单

## 结论

TEXT_ONLY 已完成真实端到端证据门；TEXT_WITH_IMAGE 首次失败。根因不是银行页面、凭据或适配器登录，而是 CLI 没有把图片附件作为自然语言主输入的补充图片接入 I10 图片事实生命周期。

## RC-001：图片附件未进入 image-ingest 生命周期（主根因，已确认并修复）

### 处理链

1. 补充图片应通过 `image_ingest_submit` 创建图片导入任务。
2. CLI 应通过 `image_ingest_get` 等待 `WAITING_USER`，再以直接执行策略提交全部事实 `CONFIRM`。
3. 确认后的 `imageIngestId` 必须写入自然语言 CaseDraft 的 `supportingImageIngestId`，再进入既有 Journey 执行链。
4. 修复已实现：保留附件文件名元数据；生产服务编排图片提交、状态等待、事实确认，并绑定 `supportingImageIngestId`。

### 证据

- 首个失败检查点：`platform/hengzhun-regression-system/.data/runtime/agent-l1-state.json`，`currentVariant=TEXT_WITH_IMAGE`、`status=FAILED`。
- 失败记录：`agent/runs/rf047/live-009/failure-1789976860015.json`。
- 修复文件：`platform/hengzhun-regression-system/agent-cli/src/preflight.mjs`、`agent-cli/src/headless-app.mjs`、`agent-cli/src/production-service.mjs`、`controller/src/runtime-adapters.mjs`。
- MCP 合同：`mcp/src/server.cjs` 的 `image_ingest_submit`、`image_ingest_get`、`image_ingest_decision_submit`。

## RC-002：L1 驱动没有保留子进程终态细节（次级根因，已修复）

- `scripts/i10-agent-l1-live.cjs` 只从 `events.at(-1)` 投影 `exitCode/terminalType/messageCode`；现已同时保留并投影 JSONL stderr 诊断。
- 离线 `generate:dist`、typecheck、Agent CLI 测试已通过。

## 已排除项

- TEXT_ONLY 在同一身份下真实通过，五类证据均 VERIFIED。
- 本次不是 `I10_GENERIC_LOGIN_REJECTED`，也没有执行银行写入或转账。

## 修复验证门

1. `generate:dist`、typecheck、Agent CLI 测试通过。
2. 源码变化后重新 `prepare` 冻结新 ReleaseIdentity。
3. 从新身份 TEXT_ONLY 起点重新验证；首次失败立即停止。

## LIVE-010 复验结果

- 新身份 `f9ec61a992039b61d24b7f4ab6b0113909593770cbb3428683836beb6fddbf85` 首先在 TEXT_ONLY 失败：`I10_TARGET_UNREACHABLE`。
- 证据：`agent/runs/rf047/live-010/failure-1789978108995.json`；当时银行核心与渠道容器均未运行，故本次身份不用于评价图片修复。
- 按首次确定性失败规则未执行 TEXT_WITH_IMAGE，未重跑 LIVE-010。

## LIVE-011 复验结果

- 新身份 `434466c57f23746d4197bf74734fb754d3428280252e55cb1633c2760dfa26a8` 冻结后，银行核心、渠道和受管 Agent 均 READY。
- L1 在公共版本回读阶段首先确定性失败：`AGENT_L1_PUBLIC_READBACK_INVALID`。
- 证据：`agent/runs/rf047/live-011/failure-1789979712740.json`。
- 按停止规则未执行 TEXT_ONLY 业务步骤，也未执行 TEXT_WITH_IMAGE；该身份不能宣称 LIVE 通过。

## LIVE-012 复验结果与后续修复

- 身份 `1ab9dc8669d32038a09d1cdd11033de96fa1982c21c8e19a34c56fcc4a8be6bf` 下同一回读失败再次复现：`AGENT_L1_PUBLIC_READBACK_INVALID`。
- 证据：`agent/runs/rf047/live-012/failure-1789980206320.json`。
- 根因进一步收敛为版本回读 stdout 存在非 JSON 噪声时，旧解析器要求整流严格 JSONL；现已改为逐行跳过非 JSON 行并寻找 `COMMAND_RESULT`。直接调用回读已通过，尚未用新源码身份做 LIVE。
- 修复后 `demo.ps1 prepare` 已冻结新身份 `614cceb0f553e03bba7d0716f74ba8295f26ba785d3b67705a14d52867ee9985`；该身份尚未执行 LIVE。

## 服务保活修复

- 根因：外层运行收尾显式调用 `demo.ps1 down`，且 L1 驱动的 `finally` 无条件停止 Harness/MCP/Worker，导致每次执行后服务关闭。
- 修复：`HENGZHUN_KEEP_MANAGED_SERVICES=1` 时保留受管 Agent 服务；LIVE 运行目录已绑定该设置。Docker 银行服务继续由 `demo.ps1 up` 启动，只有显式 `demo.ps1 down` 才停止。
- 当前 `demo.ps1 status`：银行核心/渠道 READY，Harness/MCP/Worker HEALTHY，ReleaseIdentity `76c9433516ced9ca755b932a4d5060f0160315d3f99e196ff45c2e14ac41e264`。

## 图片事实模型配置根因

- LIVE-014 的图片导入失败原因为 Worker 使用旧 `CONTROL_API_KEY`，对 DeepSeek 返回 401；当前有效配置在 `HENGZHUN_MODEL_API_KEY/HENGZHUN_MODEL_BASE_URL/HENGZHUN_MODEL_NAME`。
- 修复：图片事实筛选优先复用当前 HENGZHUN 三变量，保留 CONTROL 仅作已有环境兼容；专项测试 7/7 通过。

## LIVE-015 剩余根因

- 图片事实调用已成功，TEXT_ONLY 也通过；TEXT_WITH_IMAGE 在浏览器执行阶段失败，Worker 明确记录 `I10_MIDSCENE_LOCATOR_MISMATCH`。
- 这说明当前剩余问题已从模型/图片导入边界进入图片补充事实驱动的 Journey locator 生成或执行，不应再归因于控制模型认证。
- 证据：`agent/runs/rf047/live-015/failure-1789981939414.json`；服务仍保持 READY，未执行 `down`。

## 当前判定

- 旧身份 `TEXT_ONLY`: LIVE_E2E PASS。
- 旧身份 `TEXT_WITH_IMAGE`: LIVE_E2E FAILED。
- 新修复：STATIC/CONTRACT 已通过；公共版本回读已加入 BOM/空白归一化并忽略非 JSON 噪声，源码变化后必须重新 `prepare` 冻结新身份；LIVE 图片链尚未复验。
- `FULL18` 与 `Release GO`：未获得。
