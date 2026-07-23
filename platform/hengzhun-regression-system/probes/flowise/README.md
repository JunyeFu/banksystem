# Flowise Windows 隔离技术探针

本目录只用于验证 Flowise 是否能承担衡准自动化回归系统的本机编排候选。运行时、SQLite、日志、凭据和导出证据全部写入产品根下已忽略的 `.data/probes/flowise/`，不复用复兴银行或衡准 Harness 的运行数据。

## 固定边界

- Windows 原生运行，不依赖 WSL 或 Docker。
- 使用项目自带 Node.js 20.20.2。
- Flowise 固定为 3.0.12；同时固定 `flowise-components`、`flowise-ui` 与 `connect-sqlite3`，防止 npm 宽松依赖漂移。
- 数据库固定为 SQLite。
- MCP 只监听 `127.0.0.1`，只暴露无副作用探针工具。
- MiMo 密钥只能由环境变量注入，不写入仓库或探针证据。
- 未取得真实模型响应时，MiMo 检查只能标记为阻塞，不得以静态配置冒充通过。

## 使用

```powershell
cd D:\Agent\banksystem\platform\hengzhun-regression-system
powershell -NoProfile -ExecutionPolicy Bypass -File probes\flowise\prepare-probe.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File probes\flowise\run-probe.ps1
```

`run-probe.ps1` 在前台运行，按 Ctrl+C 停止。复制验证必须在源进程停止后复制 Flowise 应用为 `app`、状态为 `state`、项目自带 Node 为 `runtime/node-v20.20.2-win-x64`，并把本目录复制为 `probe`。随后可在副本根执行 `probe/portable-start.ps1`；不得复制或复用运行中的 SQLite 文件。

## 验收判定

探针报告必须分别记录 Windows 启动、SQLite、MiMo、MCP、人工确认、知识检索、流程导出、整目录复制重启。任何未执行项都标记为 `blocked` 或 `not_run`，不能合并成“整体通过”。

MiMo 使用官方 OpenAI 兼容地址 `https://api.xiaomimimo.com/v1` 和模型标识 `mimo-v2.5`。只有 `MIMO_API_KEY` 已注入当前进程时，`verify-mimo.cjs` 才发起真实请求；脚本不会保存或输出密钥。
