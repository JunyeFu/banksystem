# Agent任务控制面

`agent/` 只保存当前任务、路径边界、验收标准和短期实施计划，不保存完整项目知识。

- `backlog.yaml`：唯一任务状态源。
- `ownership.yaml`：逻辑责任域和跨域复核要求。
- `plans/active/`：已批准、仍有效的实施计划。
- `plans/proposed/`：尚未批准的候选计划。
- `work-items/`：单项任务扩展记录。
- `runs/`：运行态输出，Git 忽略。

状态固定为 `PROPOSED`、`READY`、`IN_PROGRESS`、`BLOCKED`、`REVIEW`、`DONE`、`CANCELLED`。任务完成度不得在其他文件重复维护。

## 实施顺序权威

当前唯一实施顺序文件是 [`agent/plans/active/v54-implementation-batches.md`](plans/active/v54-implementation-batches.md)。`plans/active/` 中其他文件只描述产品或架构范围，不得定义另一套先后关系。`docs/` 中的架构、设计、验收、证据和历史报告也不得覆盖该顺序。

I8 七阶段确定性本机引擎已完成；当前唯一新增阶段为 I9，严格按 P1—P9 推进。I8 代码级规格见 [`docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md`](../docs/design/regression-platform/i8-deterministic-authoring-spec-v1.md)，I9 产品化规格见 [`docs/design/regression-platform/i9-flowise-productization-spec-v1.md`](../docs/design/regression-platform/i9-flowise-productization-spec-v1.md)；两者只展开对象、状态机、DSL、代码落点、测试和证据，不维护全局先后关系或任务状态。

多轮对话的首读控制入口为 [`docs/control/collaboration-brief.md`](../docs/control/collaboration-brief.md)，完整追踪编号、审计结论和文档更新事务见 [`docs/control/technical-control-register.md`](../docs/control/technical-control-register.md)。两者不拥有实施顺序或任务状态。

HiAgent 2.5.1 与 Flowise 的节点、交互、Skill 和 MCP 迁移边界统一见 [`docs/architecture/overview/hiagent-flowise-capability-boundary-v1.md`](../docs/architecture/overview/hiagent-flowise-capability-boundary-v1.md)。其中 Flowise `Human Input`、`Proceed`、`Reject` 仅可作为本机适配器，开发任务不得把它们写成 HiAgent 原生能力。

新增或修订活动文档后必须执行 `python scripts/docs/validate_docs.py`；如果重新引入“全部前端完成后才能启动 Coze/Harness”等全局门槛，校验必须失败。
