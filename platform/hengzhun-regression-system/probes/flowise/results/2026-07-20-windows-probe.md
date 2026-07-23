# Flowise Windows 隔离技术探针结果（2026-07-20）

## 结论

结论为 **通过**。Windows 原生启动、SQLite、MiMo v2.5、MCP、人工确认、知识检索、流程导出和整目录复制重启均取得真实运行证据。

## 运行基线

- 操作系统：Windows，未使用 WSL 或 Docker。
- Node.js：项目自带 20.20.2。
- Flowise：3.0.12。
- SQLite 会话驱动：`connect-sqlite3` 0.9.15。
- 监听范围：Flowise 和 MCP 均只使用回环地址。
- 运行数据：`platform/hengzhun-regression-system/.data/probes/`，已被 Git 忽略。

Flowise 3.1.3 与未完全锁定的 3.1.2 在本机曾真实失败，根因包括 `@langchain/core` 子路径导出冲突，以及更新后的 `connect-sqlite3` 与 Flowise 传参约定不兼容。因此探针不采用“最新版本”浮动安装，而是固定 3.0.12 及其关键子包。

## 验证矩阵

| 检查项 | 结果 | 证据摘要 |
| --- | --- | --- |
| Windows 启动 | passed | `GET /api/v1/ping` 返回 HTTP 200 和 `pong` |
| SQLite | passed | 首次启动创建 `database.sqlite`，流程数据可在重启后读取 |
| MiMo v2.5 | passed | Flowise `ChatOpenAI` 通过官方兼容地址完成非空回答、结构化工具调用和工具结果续接；密钥仅注入验证进程 |
| MCP 调用 | passed | Flowise `MCPToolkit` 经 Streamable HTTP 发现并调用 `probe_echo`、`probe_knowledge_lookup` |
| 人工确认 | passed | Flowise `Human Input` 节点的 `proceed` 和 `reject` 均真实执行并互斥 |
| 知识检索 | passed | Flowise `Retriever` 节点通过隔离的内存向量存储命中门户登录一致性知识 |
| 流程导出 | passed | 官方 `/api/v1/export-import/export` 返回 HTTP 200；导出 1 条目标 Agentflow，文件 29,922 字节 |
| 整目录复制重启 | passed | 复制 288,538 个应用文件、1,982 个 Node 运行时文件、控制制品和 SQLite 状态；使用副本内 Node 在端口 3007 返回 HTTP 200，并读取到原探针流程 |

整目录副本共 2,051,711,317 字节。该结果证明副本不依赖原目录中的 Node 或 Flowise 依赖即可重启，但也证明未经后续瘦身的 Flowise npm 运行时体积较大，不宜直接视为最终交付包。

## 安全与限制

- 未读取或输出项目 `.env`、API Key 或登录令牌。
- 临时本地账号、Cookie、SQLite、日志、导出文件和副本均位于已忽略的 `.data`。
- MCP 探针没有文件写入、Shell 或任意网络工具。
- MiMo 已执行真实推理，但本次只验证了最小协议链路，尚未形成长时间稳定性、限流和成本数据。
- 知识检索使用隔离的内存向量存储验证 Flowise Retriever 节点语义，尚未代表最终生产知识库选型。
- 当前探针只回答可行性，不授权替换唯一开发顺序文档或更改主线架构。

## 下一判定门

Flowise 已满足进入集成设计的最低技术门。下一阶段应验证长链路工作流、多次 MCP 调用、超时重试、并发限制和 30 次以上重复执行稳定性，再决定是否成为正式主控平台。
