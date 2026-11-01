---
id: BANKSYSTEM-RF043-JOURNEY-AUTHOR-VALIDATE-001
title: RF-043 Journey author and validate task package
document_type: task_package
domain: delivery
status: EVIDENCED
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-043：Journey author 与 validate

## 业务目标

测试人员用自然语言、目标站点信息和非秘密凭据引用生成候选 Journey；模型输出必须先通过本地严格合同，再由 Harness 冻结为待批准状态，随后可独立只读校验。

## 输入与输出

`journey author <sessionId> --input-file <path> --entry-url <url> --target-system <name> --credential-ref <ref> --jsonl` 输出候选 Journey ID、版本、步骤数、断言数、内容哈希和待批准 proposal。`journey validate <journeyId>` 输出同一 Harness 冻结摘要。

## 实现

- Controller 使用唯一已绑定模型生成严格 JSON 候选，不提供工具。
- 确定性校验器拒绝未知字段、空步骤、空断言、非 HTTP(S) URL、越界文本和不完整转账参数。
- CLI 将完整候选通过现有 MCP `journey_prepare` 写入 Harness；Harness 必须返回 `READY_FOR_CASE_APPROVAL`。
- validate 仅调用 `journey_get`，不调用模型、不写状态。
- 模型只接收自然语言目标和目标系统；入口 URL 与 `credentialRef` 由控制器确定性绑定，模型不接收密钥、凭据值或凭据引用。

## 项目易错点

- 不复用旧 bootstrap approval 伪装 author。
- 不允许模型返回的状态、哈希、批准或执行结论进入权威结果。
- 不自动批准 Harness proposal。
- 不把候选保存在第二个 SQLite 或前端状态中。

## 验证

- CONTRACT：命令语法和严格候选 schema。
- INTEGRATION：假模型 + 真实服务编排边界证明一次模型调用、一次 MCP 写入和一次只读回读。
- LIVE_E2E：不在本批执行。

## 完成门

无效模型输出在 MCP 写入前失败；有效候选形成 Harness 待批准 Journey；validate 回读同一哈希与计数；approve 和 execute 调用次数均为零。
