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

新增或修订活动文档后必须执行 `python scripts/docs/validate_docs.py`；如果重新引入“全部前端完成后才能启动 Coze/Harness”等全局门槛，校验必须失败。
