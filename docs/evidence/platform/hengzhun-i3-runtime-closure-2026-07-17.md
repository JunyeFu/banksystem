# 衡准 I3 纵向闭环完成证据

日期：2026-07-17
范围：`platform/hengzhun-regression-system/` 与复兴银行门户首条被测链路
结论：I3 运行时与 Coze 公开平台退出门禁均已关闭。

## 最终结果

首条案例为“门户账号密码登录后，页眉姓名、头像与个人资料一致”。固定 Playwright Worker 使用合成凭据别名和独立 BrowserContext 执行，最终运行状态为 `PASSED`、任务状态为 `SUCCEEDED`、`runVersion=3`，决策为 `RECORDED/APPROVE`。

最终报告 Artifact 已脱敏，类型为 `REPORT`，SHA-256 为：

`67eec4c3919da40c5dba8166f53fe3caebdf6f2694c15b143ff42159bb31f1a8`

本文件不保存案例、计划、运行、任务、Artifact 或决策标识符，不保存账号密码、Token、Cookie、PII、日志、截图或本机 Artifact 路径。

## Coze 公开平台链路

仅通过 Coze Studio 0.5.1 公开界面完成：

1. 导入、调试并发布“衡准回归 Harness”OpenAPI 插件。
2. 将七个工具全部绑定到“衡准-I3-回归主控”Agent。
3. 从当前仓库知识源创建并绑定“衡准-I3-门户登录回归知识库-v2”，移除旧库，设置自动检索和最大召回 5。
4. 使用真实 MiMo v2.5，发布 Agent。
5. 在 Agent 恢复会话中真实调用 `case_create_draft`、`case_get`、`plan_compile`、`run_submit`、`task_get`、`artifact_get_metadata`、`decision_submit`。

七工具由同一发布 Agent 分段执行：首次会话创建并复核案例；中断后新会话读取 SQLite 中同一对象继续计划、运行、查询、取证和决策。没有重复创建 v2 案例、计划或运行，证明恢复链不会把领域状态迁入 Coze。

## 知识检索证据

Knowledge Base 自动检索实测非空。旧知识库与仓库导入源发生版本漂移后，已通过公开 UI 创建 v2、挂载 v2、移除旧库并重新发布 Agent。全新空白调试会话的 KnowledgeRetriever 返回当前凭据别名 `i3-customer`、七工具顺序与引用 `kb:i3-login-profile:v1#identity-consistency`，且未返回旧别名。案例创建只向 Harness 提交来源、引用和脱敏摘要；SQLite 仅保存问题 Hash、结果 Hash 和引用，不保存检索正文。

## MiMo 兼容网关

外部 MiMo v2.5 的非流式 OpenAI 工具调用可用，但原生 `stream=true` 在当前接口上出现超时，导致 Coze 工具链中断。I3 增加 `hengzhun-model-gateway`：

- 仅在 Docker 内部网络向 Coze 提供 OpenAI SSE；不发布宿主端口。
- Coze 与网关之间使用独立 Bearer Token；上游模型密钥只在忽略的运行配置中。
- 上游固定使用非流式调用，成功响应转换为标准 SSE。
- 模型传输超时可安全重试；下游只收到一次完成事件。
- 兼容 MiMo 偶发的完整伪工具块并转为结构化函数调用；不补全截断或缺少必填参数的伪调用。
- 不读取 SQLite，不调用 Worker，不保存对话或 Harness 领域状态，因此不构成第二个 Agent。

网关单元测试覆盖鉴权、健康端点、SSE 转换、结构化工具调用、伪工具块规范化和瞬时失败重试。

## 修复的真实缺口

- Coze 0.5.1 OpenAPI 兼容：操作只文档化 HTTP 200，不使用 `additionalProperties`，严格校验仍由 Harness Zod fail-closed 完成。
- 门户一致性竞态：Worker 原先在资料查询完成前读取页眉默认名；现等待个人资料可见且两处姓名一致后再取证，没有放宽断言。
- Keycloak 准备脚本：stdin Base64 传输先过滤非 Base64 字符，避免 Windows 管道编码噪声导致初始化失败。
- Coze 知识库：原先实际未绑定且按需检索；现已用当前导入源创建 v2、替换旧库、自动检索并实测非空。
- MiMo 流式兼容：通过受控网关修复，不更换主控模型、不绕过 Coze。

## 可复验入口与制品 Hash

- `npm run test:i3`
- `npm run verify:i3`
- `scripts/verify-i3-live.ps1`
- `verify.cmd`

关键制品 SHA-256：

- OpenAPI：`dfbf05412cdf9292eac430cde4634c63e67d414ae31f28d6592b089c92c05568`
- Agent Prompt：`f5fd21599761a7105295e3060df67906c29bad0806bd8dd7c11ac97f5eb24a51`
- Knowledge 源：`55c6f40f88881c5f7a161069bc7d9d4e8dc2092e7e4a832ccbc94eb1ba0bf731`
- Model Gateway：`9e747e5d26ecd6a47f2f8c3f09cb17cfadc5a3890549bfa5899d8199b41a3e0e`
- Playwright Worker：`49ee64757a1a0fe8c336f6df83ab18f396746c16eb55a009a76e389c8d839879`

上述 Hash 在后续代码改动后必须重新生成；不能把本文件中的旧 Hash 当作未来运行证据。
