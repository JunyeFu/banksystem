---
id: DOC-DESIGN-INDEX
title: 设计文档索引
document_type: reference
domain: design
status: accepted
authority: normative
version: 1.2
effective_date: 2026-07-21
owner: project-owner
---

# 设计文档索引

- [`frontend/`](frontend/README.md)：复兴银行数字银行系统与衡准自动化回归测试平台的前端设计。
- [`regression-platform/i8-deterministic-authoring-spec-v1.md`](regression-platform/i8-deterministic-authoring-spec-v1.md)：已完成 I8 确定性本机引擎的代码级规格；只展开 I8，不拥有全局排期权。
- [`regression-platform/i9-flowise-productization-spec-v1.md`](regression-platform/i9-flowise-productization-spec-v1.md)：已冻结的 I9 Flowise 历史基线。
- [`regression-platform/i10-flowise-formal-portable-spec-v1.md`](regression-platform/i10-flowise-formal-portable-spec-v1.md)：当前 I10 正式便携版的参数、合同、安全和验收规格，不拥有全局排期权。
- [`../architecture/overview/hiagent-flowise-capability-boundary-v1.md`](../architecture/overview/hiagent-flowise-capability-boundary-v1.md)：HiAgent 2.5.1 与 Flowise 的能力交集、交互适配和迁移门禁；优先于历史平台假设。
- [`regression-platform/README.md`](regression-platform/README.md)：I8/I9 回归平台设计辅助规格索引和状态边界。
- 银行业务设计继续由架构基线、状态机和 OpenAPI 共同约束。
- 回归平台当前目标设计以唯一实施顺序和 I10 规格为准；I8/I9 仅作不可变历史基线，Coze/Dify 文档只保留历史事实。

设计文档表示目标状态。只有在当前能力矩阵、测试和运行证据同步后，才能标记为 `implemented` 或 `verified`。
