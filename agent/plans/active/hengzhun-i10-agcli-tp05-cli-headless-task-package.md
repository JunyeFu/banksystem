---
id: HENGZHUN-I10-AGCLI-TP05-CLI-HEADLESS-001
title: CLI and JSONL headless interface
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP05：CLI 与 Headless

目标：实现稳定 CLI 命令、stdin/file 输入、附件和 JSONL 事件协议。业务规则：stdout 在 JSONL 模式只含 schema 事件；诊断进 stderr；批准点退出 20；不存在 `--yes`。易错点：提示文本污染 JSONL、退出码不稳定、参数中泄露秘密、headless 自动写。

实现模板：command grammar → event schema → exit-code registry → attachment preflight → resume approve/reject → golden streams。允许新 `agent-cli/**`、入口、tests/docs/RF；禁止 TUI 绘制、Flowise、live。Done：基线所列命令全有契约测试，管道/编码/取消/批准退出码稳定，unknown option fail-closed。

执行批次：`RF-020/S1`。TP04 离线验收已通过；本批只实现可注入的无头应用层、JSONL 合同、附件预检和精确批准命令，不实现 TUI、不启动服务、不访问真实模型/MCP 或正式会话根。

完成事实（2026-08-26）：RF-020 已关闭；Node24 CLI 矩阵 11/11、完整注册套件 522/522。基线命令、JSONL 黄金流、固定退出码、stdin/file/附件预检、精确 approve/reject、Ctrl-C 与 broken pipe 均有合同证据；`--yes` 退出 2，批准点退出 20。运行时仍明确 `UNBOUND`，不构成 TUI、正式会话启用、LIVE、身份冻结或发布。
