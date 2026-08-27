---
id: HENGZHUN-I10-AGCLI-TP06-TERMINAL-UI-001
title: Terminal user interface
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP06：终端 TUI

目标：用固定 pi-tui 版本实现 header/transcript/stage/footer/overlay 和全部 slash commands。业务规则：TUI 是 CLI 同一应用层的投影，不拥有业务状态；HIGH 风险需输入 proposal 后缀。易错点：resize/Unicode 破版、overlay 绕过批准、渲染日志泄密、TUI 与 headless 语义漂移。

实现模板：view model → deterministic reducer → layout → modal approval → keyboard/resize/accessibility → snapshot/PTY tests。允许 `agent-cli/tui/**`、tests/docs/RF；禁止控制器业务复制、Web UI、live。Done：Windows Terminal 关键尺寸、中文宽度、Ctrl-C、恢复、附件与批准交互通过；TUI/JSONL 同事件等价。

执行批次：`RF-021/S1`。TP05 离线验收已通过；本批只实现 JSONL 同事件的纯 reducer、布局、modal 和伪终端验证，不绑定真实 Controller/MCP、正式会话根或 LIVE。

完成事实（2026-08-26）：RF-021 已关闭；TUI 11/11、CLI 合计 22/22、完整注册套件 523/523，依赖审计 0 漏洞。40/80/120 列、多语言宽度、resize、全部 slash commands、HIGH proposal 后缀确认、Ctrl-C 130 与 overlay 恢复均通过。证据仅为快照/伪终端，不构成生产组合、LIVE、身份冻结或发布。

生产桥接补充（RF-024-S1B，2026-08-26）：默认交互、`--continue` 与 `--resume` 已接入同一 production service，不再返回 `TUI_NOT_INSTALLED`。同 Journey 续聊会分叉新的 DPAPI 加密 session/thread；待决精确审批禁止绕过，已有会话禁止隐式携带附件。TUI 13/13、headless 12/12；真实 PTY 可启动并由 `/exit` 返回应用码 0。该证据未启动 Harness/MCP/Worker、未调用模型，仍不构成 LIVE。
