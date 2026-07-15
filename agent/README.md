# Agent任务控制面

`agent/` 只保存当前任务、路径边界、验收标准和短期实施计划，不保存完整项目知识。

- `backlog.yaml`：唯一任务状态源。
- `ownership.yaml`：逻辑责任域和跨域复核要求。
- `plans/active/`：已批准、仍有效的实施计划。
- `plans/proposed/`：尚未批准的候选计划。
- `work-items/`：单项任务扩展记录。
- `runs/`：运行态输出，Git 忽略。
- `archive/`：旧阶段调度器和被替代计划。

状态固定为 `PROPOSED`、`READY`、`IN_PROGRESS`、`BLOCKED`、`REVIEW`、`DONE`、`CANCELLED`。任务完成度不得在其他文件重复维护。
