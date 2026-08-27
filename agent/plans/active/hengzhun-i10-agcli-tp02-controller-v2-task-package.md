---
id: HENGZHUN-I10-AGCLI-TP02-CONTROLLER-V2-001
title: Deterministic controller v2
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP02：Controller v2

目标：实现 `DETERMINISTIC_PREFETCH_JSON` LangGraph 图与 `ANSWER|CLARIFY|PROPOSE` 结构化输出。业务规则：模型只做规划；策略代码决定风险和转移；proposal 冻结后精确批准、只写一次并由 Harness 回读。易错点：执行时重算参数、批准模糊意图、模型降低风险、工具调用 mock 冒充 live capability。

实现模板：schema/prompt → deterministic prefetch → planner adapter → transition validator → proposal hash/TTL → approval interrupt/resume → one mutation/readback → replay/conflict tests。允许 `controller/**` 及专属合同/测试/RF 文档；禁止真实流量、Flowise、SQLite、发布。Done：状态机正负矩阵、过期/篡改/重放/跨 namespace 全拒绝，配置模型无工具也可完成离线图。

执行批次：`RF-017/S1`。TP01 离线验收已通过；本批只授权 Controller v2 的离线实现和验证，禁止真实模型流量、运行态激活、Flowise、SQLite 与发布。

完成结果：RF-017 已关闭。默认画像实现确定性 prefetch、无工具三态 JSON 规划、策略风险、冻结批准、一次写与 Harness 权威回读；Controller 46/46、注册套件 519/519 及治理门通过。结果仍为未激活离线证据，真实模型与 MCP/Harness 适配属于 TP03。
