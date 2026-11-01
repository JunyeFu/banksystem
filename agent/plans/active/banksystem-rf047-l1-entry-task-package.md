---
id: BANKSYSTEM-RF047-L1-ENTRY-001
title: RF-047 L1 authoritative entry gate
document_type: task_package
domain: delivery
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-08
owner: Codex
---
# RF-047：A06 L1 入门

## 业务目标
测试人员只把同一身份的真实终态与完整证据计为 L1 通过，不把模型回复完成计为执行成功。

## 输入与输出
输入：冻结身份、L1 文本文件、图片说明文件和合成附件；输出：输入摘要、预期证据合同、精确 Journey/Run/Task、五类证据字节复验与不可覆盖的 L1 结果。

## 实现
- S1（1–2 天，本次批准）：接入公开 evidence verify；在旧检查点复用前检查身份；冻结输入与预期结果摘要；隔离离线行为测试。
- S2（1 天，2026-09-08 已授权 LIVE）：当前身份 TEXT_ONLY，精确审批，完整浏览器链与证据回读。
- S3（1 天，2026-09-08 已授权 LIVE）：S2 通过后才运行 TEXT_WITH_IMAGE，保留 OCR/事实确认关联，再安全停止。

## 项目易错点
COMPLETED 回复不是 Run PASSED；缓存 PASSED 不是当前身份成功；图片不能在文本失败后启动；输入文件变化不能继续旧批准；JSON 证据是投影而非第二个执行状态源。

## 验证
平台目录：`npm.cmd run generate:dist`、`npm.cmd run typecheck`、`runtime/node-v20.20.2-win-x64/node.exe --test scripts/verification/agent-l1-live.test.cjs`、`npm.cmd run test:registered`。
仓库根目录：`py -3 scripts/architecture/validate_refactoring.py --batch RF-047`、`py -3 scripts/docs/validate_docs.py`。
S2/S3 命令：`npm.cmd run preflight:agent:l1`、`npm.cmd run run:agent:l1`；审批使用 `npm.cmd run approve:agent:l1 -- <sessionId> <proposalId> <contentHash>`，不得自动批准。

## 完成门
S1：上述离线检查退出 0；缺失、篡改、身份或输入漂移均不能 PASSED；失败时 image 调用次数为 0。测试前后运行时与正式账本不变，源码身份改变必须记录。S1 完成仅进入 REVIEW，不代表 A06 完成。
S2/S3：同身份双变体各自 Journey terminal、Run PASSED、Task SUCCEEDED、DOM/SCREENSHOT/TRACE/NETWORK/LEDGER 完整且每个制品 sizeVerified/sha256Verified 为 true；首次确定性失败停止该轮。2026-09-08 用户授权冻结和 S2/S3 LIVE，包括必要的本项目服务启停与模型调用；不包含 Full18、发布、重置或银行业务写入。新生成提案仍逐项请求精确人工审批。

## S1 收尾
2026-09-08：L1 合同 21/21、完整注册测试 654/654；构建、类型、治理和文档门通过。只读 preflight 返回 READY、executionPerformed=false。新源码身份为 `445ed03a549202b32083e4a42c4d6ff7ede2550ab72a43bcc34905b30d6e2bcf`，未重新绑定 LIVE 授权。证据见 [RF-047 evidence index](../../../docs/architecture/refactoring/batches/RF-047/evidence-index.md)。S1 工程完成进入 REVIEW；S2/S3 的合成正式输入、运行时绑定与 LIVE 授权仍是下一门。

## S2 当前检查点
随后用户授权冻结和 S2/S3 LIVE，输入与身份绑定已完成。六项 doctor READY；TEXT_ONLY 返回创建权威 Journey 的 LOW 风险精确提案，当前等待人工审批。尚未执行浏览器，S3 未启动。完整三元组与过期时间见上述 evidence index；不得将运行授权等同于新提案的自动批准。
