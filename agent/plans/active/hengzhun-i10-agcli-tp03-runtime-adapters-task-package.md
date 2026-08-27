---
id: HENGZHUN-I10-AGCLI-TP03-RUNTIME-ADAPTERS-001
title: Controller runtime adapters
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP03：真实运行适配器

目标：把 ControllerPort 接到独立 MCP/Harness，只建立受控读写适配，不接用户流量。业务规则：MCP 不直接读 SQLite/凭据；每次 mutation 的 target/version/hash 与 proposal 完全一致；写后以 Harness 权威视图对账。易错点：适配器吞错误码、重试非幂等写、把 transport success 当业务 success。

实现模板：typed adapter → timeout/cancellation → canonical error envelope → idempotency/fencing → readback reconcile → fault injection。允许 controller adapters、MCP/Harness 客户端合同、tests/RF；禁止 CLI/TUI、Flowise、正式运行/账本。Done：断线、超时、409、stale version、重复请求和读回不一致均确定性失败关闭。

执行批次：`RF-018/S1`。TP02 离线验收已通过；本批只授权适配器实现与故障注入，禁止真实模型请求、正式运行、账本和发布。

完成结果：RF-018 已关闭。Controller v2 已通过组合工厂连接无工具 OpenAI JSON 适配器和独立 MCP loopback 适配器；19/19 故障矩阵、65/65 controller 与 520/520 注册回归通过。真实端点能力仍未验证，不能视为 LIVE 可用。
