---
id: HENGZHUN-I10-AGCLI-TP01-MCP-DECOUPLE-001
title: Independent MCP and contract normalization
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP01：MCP 去 Flowise 耦合

目标：MCP 使用自身锁定的 SDK，冻结 35 工具 v2 和 `attachmentRef`/附件导入合同。业务规则：query 必须纯读；compile/ack 显式写；Harness 继续拥有状态与写后回读。易错点：`candidate_get/preview/result_inbox_list` 隐式副作用、从 Flowise `node_modules` 加载 SDK、暴露本机路径。

实现模板：先写合同/特征测试 → 本地依赖锁 → 拆出 `candidate_compile`/`result_inbox_ack` → raw-stream attachment import → 兼容别名只进冷回滚 → 负向测试。允许 `mcp/**`、Harness 附件端点、contracts/tests 和专属 RF 文档；禁止 CLI/TUI、Flowise 运行树、`.data`、发布。Done：35/35 唯一分类、13 READ_ONLY/22 MUTATING、读工具零写、SDK 无 Flowise 路径、hash/版本漂移失败关闭、聚焦与完整注册测试通过。

执行批次：`RF-016/S1`。当前只授权离线实现与验证；运行时激活、发布和 LIVE 仍禁止。

完成结果：RF-016 已关闭；35 工具合同、SDK 独立加载、纯读/显式写拆分与 Harness 附件导入均已落盘。聚焦测试 57/57、注册测试 517/517、构建和治理门通过。该结果仅证明离线合同与隔离集成，不构成 LIVE、身份冻结或发布证据。
