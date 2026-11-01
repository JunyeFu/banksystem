# P0 修复控制：演示启动与 CLI 产品入口

日期：2026-09-21。源码基线：`main@552b3b8ac517bd5991bff446e72d9f4e87ea9543`，保留当前未提交工作树。此文件只控制本次 P0 修复；项目顺序与状态分别以 `v54-implementation-batches.md`、`agent/backlog.yaml` 为准。

## 目标与边界

1. 运行门：核实 2026-09-21 的 `demo up` 是否真实退出失败；若是，定位首个失败服务并修复最小原因。以完整进程退出码、`demo status` 的 `READY`、`hz-agent doctor` 的 `READY` 和保留卷的 `demo down` 退出码验收。禁止在 `up` 仍运行时把中间 `status` 当作确定性失败。
2. 文档门：根 README、衡准产品 README 与当前能力矩阵必须把 Windows `demo.ps1` + `hz-agent` 作为当前入口；Flowise 仅为历史资料。旧 LIVE/Full18 证据不得转称当前身份完成。

只改启动/状态所需最小代码、上述文档和任务控制记录；不执行 `reset`、不删除卷、不运行 RF-047 S2/S3 LIVE、不修改旧证据、不提交或发布。模型密钥及运行日志不进入控制文件。

## 执行与判定

先记录进程退出码和服务状态，再针对确定性失败修改源码；若 `up` 成功，原“启动失败”记录只能改为未证实的中途观察，不制造代码修复。启动验收只证明运行就绪，不证明银行黄金业务、真实模型 LIVE 或 Full18。

文档修改后运行 `py -3 scripts/docs/validate_docs.py` 和 `git diff --check`；启动链修改后运行对应聚焦测试。所有要求的检查通过才将本次 P0 置于 `REVIEW`；任何失败保留精确阻塞，不标记 `DONE`。源码/合同变更引起 ReleaseIdentity 漂移时，旧身份保留为历史，后续 LIVE 必须重新冻结。

## 本次结果

- `demo.ps1 up` 完整退出码 0，返回 `READY`，身份为 `445ed03a…d6e2bcf`；启动约两分钟。`demo.ps1 status` 退出码 0，核心四项、渠道十一项和 Agent 三服务就绪。
- `hz-agent doctor` 退出码 0，模型、Harness、MCP、Worker、浏览器和银行六项均 `READY`。
- `demo.ps1 down` 退出码 0，返回 `STOPPED`、`volumesPreserved=true`。未执行 `reset`。
- 之前在 `up` 进程仍运行时看到的“渠道未启动”不是确定性启动失败的充分证据；保留原观察记录，但撤回以其阻断运行就绪的结论。本次没有复现启动代码故障，因此未改启动代码。
- 根 README、衡准 README 与当前能力矩阵已对齐 CLI 入口及历史 Flowise 边界；`verify` 当前未实现，文档明确标注。
- `py -3 scripts/docs/validate_docs.py` 退出码 0；`git diff --check` 退出码 0（仅现有工作树的 LF/CRLF 提示）。本次 P0 为 `REVIEW`，不宣称 L1 LIVE、Full18 或正式发布完成。
