# RF-047 S2 Journey bootstrap 根因修复

## 根因证据

`agent/runs/rf047/root-cause-001/fresh-bootstrap-diagnostic.mjs` 在临时目录中启动 Fresh Harness 与真实 MCP：产品 bootstrap 省略空 `supportingImages` 时稳定返回 `MCP_PROTOCOL_INTERNAL_ERROR`；同一 MCP 工具显式传入 `supportingImages: []` 时创建并回读权威 Journey。根因是 `mcp/src/server.cjs` 将该字段声明为 optional，却在处理器中要求其必须为数组，且无代码异常被错误投影为内部错误。

修复上述边界后，`agent/runs/rf047/live-003/failure-1789964092378.json` 暴露第二个确定性根因：CLI 的 `bootstrapProposal()` 只冻结 `inputType` 和 `naturalLanguage`，没有把已有 BYOK 作者化器生成的 `draftJson` 以及 `entryUrl`、`targetSystem`、`credentialRef` 提交给 Harness。Harness 因而按合同返回 `NEEDS_INPUT`，CLI 映射成 `CLARIFICATION_REQUIRED`，L1 驱动正确停止。

完整 bootstrap 修复后，`agent/runs/rf047/live-004/failure-1789972344805.json` 暴露第三个确定性根因：bootstrap 返回的第二个批准是 Harness 冻结的案例提案，但通用 `resume()` 把它交给 Controller 私有提案仓恢复。该提案从未由 Controller 生成或保存，因此批准在写入 Harness 前失败，session 事件中没有 `APPROVAL_RESOLVED`。

## 逐步修复

1. **MCP 边界**：仅把缺失的 `supportingImages` 归一化为空数组；其他非数组输入仍失败，并携带 `I10_JOURNEY_SUPPORTING_IMAGES_INVALID` 安全错误码。
2. **CLI 错误投影**：Journey bootstrap 的 MCP 失败只投影确定性的业务码或适配器码，不再变成 `UNEXPECTED_FAILURE`。
3. **隔离验证**：Fresh Harness + 真实 MCP 覆盖“字段省略 → Journey 创建 → sessionRef 回读”；MCP/CLI 聚焦测试、RF-047 治理和文档检查全部退出 0。
4. **LIVE 复验**：`demo.ps1 prepare` 冻结新 ReleaseIdentity，归档旧 FAILED 检查点；只运行 TEXT_ONLY 到新的精确人工批准门。批准后要求 Journey、Run、Task 和五类证据全部终态通过，首个确定性失败立即停止，不进入图片链。
5. **完整 bootstrap**：TEXT_ONLY 在首次 bootstrap 审批前调用现有 BYOK 作者化器；显式目标描述中的入口、目标系统和凭据引用与生成草案共同进入审批哈希。批准后 Harness 必须直接返回 `READY_FOR_CASE_APPROVAL`，CLI 再暴露第二个精确案例审批门。
6. **案例审批路由**：第二个提案显式标记为 `JOURNEY_CASE_APPROVAL`；`resume()` 复用现有 `journeyDecision()` 对 Harness 当前版本、proposalId 和 contentHash 做精确比对并提交 `APPROVE_CASE/REJECT_CASE`，不再进入 Controller 私有提案仓。
7. **终态执行**：获批后复用现有 `journeyExecute()`；Worker 的 `QUEUED` 和 `RUNNING` 仅为处理中状态，只有 `SUCCEEDED` 才向 headless CLI 返回 `COMPLETED`，首个失败终态原样停止。

## 完成门

- CONTRACT：缺失字段与显式空数组行为一致；非法对象仍返回精确错误码。
- INTEGRATION：Fresh Harness + MCP bootstrap 和 `sessionStatus` 回读同一非占位 Journey。
- INTEGRATION：完整自然语言 bootstrap 不得返回 `CLARIFICATION_REQUIRED`；Harness 权威状态必须为 `READY_FOR_CASE_APPROVAL/AWAITING_USER`。
- INTEGRATION：Harness 案例批准必须产生 `JOURNEY_DECISION_RECORDED`、`APPROVAL_RESOLVED` 和终态浏览器执行；不得访问 Controller 私有提案仓。
- LIVE_E2E：当前新身份的 TEXT_ONLY 为 PASSED，证据验证包含 DOM、SCREENSHOT、TRACE、NETWORK、LEDGER；否则 S2 保持 BLOCKED。

不修改银行业务、Flowise、旧证据、凭据或历史数据库；生产直通模式只允许一次明确的 Harness 精确批准调用，不重复提交，不重试未知副作用。

## 后续策略变更

项目负责人于 2026-09-21 明确取消生产 CLI 运行路径的 bootstrap 与案例人工批准门。Agent 直接提交 Harness 精确批准并执行 Worker；保留账务、凭据、幂等、ReleaseIdentity、终态和证据约束。该变更使之前冻结身份失效，必须重新生成身份并从 TEXT_ONLY 起点复验。
