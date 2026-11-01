---
id: BANKSYSTEM-OSS-A05-CLI-PRODUCT-INTEGRATION-001
title: CLI Agent product integration task package
document_type: task_package
domain: delivery
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# TP-A05: 真实 CLI Agent 控制面

## 业务目标

测试人员通过 `hz-agent` 检查环境、恢复会话、生成并批准 Journey、执行真实浏览器测试并核验证据；Harness 是唯一状态写入者。

## 输入与输出

输入为唯一 BYOK 模型绑定、银行与 Agent 服务、自然语言目标和本地凭据引用。输出为连续 Journey、Run、Correlation、ReleaseIdentity 和可验证证据。

## 实现

- RF-040：固定 doctor 六项顺序、`service status` 合同与产品退出码。
- RF-041：固定 Harness 权威的 `session start|resume|status`，以及跨 CLI 进程重建恢复合同。
- RF-042：固定唯一 BYOK 三变量绑定、单次最小探测、脱敏身份与显式错误合同。
- RF-043 / RF-044：真实模型 author/validate 与精确版本 approve/reject。
- RF-045 / RF-046：MCP/Worker 浏览器 execute、五类证据捕获与 CLI 字节复验。

## 项目易错点

- 不得用 Node 文件存在代替模型、Worker 或银行就绪。
- 不得重试、切换模型、静默降级或复用 Flowise。
- author 不能执行，approve 只能批准冻结 revision，execute 不能重新生成参数。

## 验证

STATIC / CONTRACT / INTEGRATION 由每个 RF 独立记录；真实 BYOK、浏览器和银行调用只在新身份与明确 LIVE 门下执行。

## 完成门

正式命令全部实现；真实模型生成的已批准 Journey 经 MCP、Harness、Worker 执行；四类 ID 连续且证据校验通过。不以 RF-040/RF-041 的离线与集成测试冒充 A05 完成。

2026-09-08 收尾：RF-046 真实运行验收返回 VERIFIED，最终注册测试 640/640；证据与命令见 [RF-046 evidence index](../../../docs/architecture/refactoring/batches/RF-046/evidence-index.md)。A05 工程完成进入 REVIEW；A06 Full18、LIVE_E2E 与发布判定仍为独立门。
