---
id: DOC-ARCH-INDEX
title: 架构文档索引
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.4
effective_date: 2026-08-01
owner: project-owner
---

# 架构文档索引

- `adr/`：单项架构决策及其取舍。
- `decision-log/`：跨批次决策登记。
- `overview/`：系统和知识控制面总览。
- `overview/flowise-sqlite-hiagent-regression-baseline-v1.md`：当前目标架构基线；先划分 Flowise Agent 平台与本地工具操作，再冻结 Flowise 平台知识库、Flowise SQLite 和 Harness SQLite 的职责及向 HiAgent 的迁移；产品不包含自研 RAG 结构。I8 引擎已关闭，I9 负责正式平台化和最终交付。
- `overview/hiagent-flowise-capability-boundary-v1.md`：HiAgent 2.5.1 帮助资料、真实界面节点与 Flowise 节点的能力交集、交互适配、MCP 网络边界和迁移门禁；`Human Input`/`Proceed`/`Reject`仅属 Flowise 本机适配层。
- `overview/dify-hiagent-portable-regression-baseline-v1.md`：已被替代的 Dify 候选基线，只保留历史决策。
- `overview/coze-harness-midscene-observability-boundary.md`：I0—I7 的 Coze、Harness、Midscene、Playwright 与衡准历史职责边界和验收参数。
- `coze-hiagent-workflow-design-v1.md`：历史 Coze 目标设计；未来目标架构已由 Flowise/SQLite/HiAgent 基线覆盖，历史背景和既有证据仍保留。
- `state-machines/`：银行业务状态机。
- [`refactoring-control-process-v1.md`](refactoring-control-process-v1.md)：复兴银行与衡准平台获准重构批次的全过程控制规范，定义基线冻结、合同门禁、写入白名单、修改预算、影子比较、切流、观察、回滚、清理和AI执行边界；不构成第二套项目实施顺序。
- [`refactoring/`](refactoring/README.md)：重构模块边界、依赖规则、行为保护层、Agent任务包、量化指标、批次合同和RF-000前置证据。
- `v5.4-external-demo-baseline.md`：I0—I7 组合产品历史目标基线，已被 Flowise/SQLite/HiAgent 基线替代。
- `v54-coze-harness-acceptance-matrix.md`：I0—I7 Coze/Harness 回归核心的历史验收矩阵。
- `../design/regression-platform/i9-flowise-productization-spec-v1.md`：I9 P1—P9 的 Flowise 产品化、便携候选和最终可压缩提交文件夹辅助规格。

当前实现完成度以 [`../current-state/capability-matrix.md`](../current-state/capability-matrix.md) 为准。
