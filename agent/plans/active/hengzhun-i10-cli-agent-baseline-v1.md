---
id: HENGZHUN-I10-CLI-AGENT-BASELINE-V1
title: Hengzhun I10 CLI Agent Baseline
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.1
effective_date: 2026-08-30
owner: project-owner
---

# Hengzhun I10 CLI Agent 基线 v1

## 1. 基线结论

I10 的目标交互面是 Windows 单操作员使用的本地 CLI Agent `hz-agent`。Flowise 不属于交付产品，不启动、不依赖、不回退；既有 Flowise 文件只作为不可改写的历史证据。本文是 CLI 产品与架构基线，不是运行成功或发布证据。

捕获时事实：Git `9d79b7c1e6cfedd995093cc7a378dc8e9218fa98`、共享脏树；ReleaseIdentity `fbe97820dbb5d8132a3f678d886524a5f75215b212bb5181cfda8960fca69630`；当前身份正式账本 `0/18`，历史 228 条均不可提升；受管运行态不可用，公共 API 回读缓存过期，`releaseAligned=false`。

## 2. 产品边界与业务常识

- v1 是纯终端产品：交互 TUI 与 JSONL headless；不建设 Web UI。
- 读取、解释、规划可自治；任何写操作必须冻结精确提案并由用户逐次批准。
- 无 `--yes`、全局自动批准或模型自降风险；headless 遇批准点输出事件并以退出码 20 停止。
- 会话默认自动保存，以 Windows CurrentUser DPAPI 加密；安全元数据可明文，原始输入、工具参数、凭据和宿主绝对路径不得明文持久化。
- Harness 继续拥有 Journey、SQLite、凭据、幂等、版本与写后回读；Worker 继续拥有浏览器执行；MCP 是独立、薄、无业务状态推断的端口。
- 产品生命周期不发现、启动、停止或调用 Flowise。CLI、MCP、Harness 和 Worker 构成唯一执行链。

## 3. 目标架构

```text
Windows Terminal / JSONL
          |
       hz-agent
          |
 LangGraph Controller
          |
   independent MCP
          |
        Harness
          |
        Worker
          |
 Midscene / Playwright -> evidence
```

控制器固定图：`bootstrap/hydrate -> deterministic prefetch -> structured plan -> allowed transition -> freeze proposal -> exact approval -> one mutation -> Harness readback -> render`。规划结果只有 `ANSWER | CLARIFY | PROPOSE`。模型不能直接调用变更端口，也不能降低确定性风险等级。

默认 profile 为 `DETERMINISTIC_PREFETCH_JSON`：控制器先用确定性代码读取上下文，再让不带工具的模型生成结构化结果。只有真实 capability probe 证明配置模型可靠支持工具调用，并冻结新身份后，才可增加 read-tool Deep Agent profile。

## 4. 固定技术选择

- CLI/TUI：`@earendil-works/pi-tui@0.84.3`，MIT，Node `>=22.19`；产品固定 Node `24.19.0`。
- Controller：LangGraph；OpenAI 适配固定 `@langchain/openai@1.5.0` 并与现有 core 锁兼容。
- MCP：`@modelcontextprotocol/sdk@1.30.0`、`zod@4.4.3`，不得从 Flowise 安装目录解析 SDK。
- 公共附件引用统一为 `attachmentRef`；`flowiseFileRef` 不得进入交付合同。

## 5. MCP v2 合同

目标工具集合为 35：13 个纯读、22 个变更。新增 `candidate_compile` 与 `result_inbox_ack`，并使 `candidate_get`、`candidate_preview`、`result_inbox_list` 严格纯读。所有 mutator 必须携带批准前冻结的 target、`expectedVersion`/hash、风险和过期时间；批准后只允许一次写入，再由 Harness 权威读回。

附件导入由 Harness 提供原始流端点 `POST /v1/i10/attachments:import`，请求头包含 base64url 文件名、purpose、SHA-256，返回 `AttachmentReceiptV1`。不得把本机路径、临时 URL 或 Flowise file id 当成持久合同。

## 6. CLI 合同

```text
hz-agent
hz-agent --continue
hz-agent --resume <session>
hz-agent --no-session
hz-agent run --input-file <file> [--attach <file>] --jsonl
hz-agent resume <session> --approve|--reject --proposal <id>
hz-agent session list|show|fork|archive
hz-agent journey show <id>
hz-agent evidence <journey>
hz-agent credential enroll
hz-agent doctor | service | version
```

交互命令：`/new /resume /fork /attach /journey /evidence /approve /reject /credential /doctor /compact /exit`。TUI 至少有 header、transcript、stage、footer 与 modal overlays；HIGH 风险要求输入 proposal id 后缀二次确认。

## 7. 会话、安全与恢复

- 事件、checkpoint、批准记录加密；明文仅允许不可逆 id、时间、状态、版本和内容 hash。
- 默认保留 30 天；批准 TTL 5 分钟；过期、重放、版本漂移、目标漂移均失败关闭。
- fork 不继承未决批准；resume 必须重新验证 namespace/thread/journey/release 绑定。
- 不持久化原始附件路径；日志和 trace 使用 allowlist 投影。

## 8. ReleaseIdentity v4 与上线谓词

v4 纳入 CLI/TUI/controller/MCP 源码与锁、session schema、risk policy、prompt、Node24、lifecycle、正式测试清单和合同 hash；不纳入 secrets、用户数据和原始会话内容。任何受控输入漂移必须生成新身份，旧证据自动 stale。

上线按以下门禁推进：离线合同与集成全绿；同一身份先跑 L1 `TEXT_ONLY`，再跑 `TEXT_WITH_IMAGE`，首次确定性失败立即停止；随后同一身份完成 18/18、供应链门、DPAPI restore、冷启动复验和 Quality Portal 回读。L1 只证明薄链，不等于完整上线。

## 9. 迁移与恢复

TP01～TP08 的离线实现保持为 CLI 基础。产品运行恢复只允许重启同一版本的 CLI、MCP、Harness、Worker 与银行服务；Flowise 资产只保留历史证据，不构成恢复路径，也不能借用 CLI 身份的证据。

## 10. 易错点

- 把 `candidate_preview` 或 inbox list 的隐式写继续伪装为 READ_ONLY。
- 批准的是模糊意图，而执行时重新生成参数；正确做法是批准冻结 proposal。
- 用模型工具调用能力的文档或 mock 代替配置模型 live probe。
- 让 MCP 直接访问 SQLite、凭据或推断 Journey 终态。
- 把旧身份 228 条、L1、静态测试或文档 CLOSED 当成当前 18/18。
- 在正常生命周期里保留 Flowise 启动、SDK 路径或附件引用耦合。

## 11. 任务组合

唯一机器可读组合见 `hengzhun-i10-cli-agent-task-packages-v1.yaml`。TP00 建立本基线；TP01～TP10 依次实施。除 TP00 外，每个包在执行前必须拆成单变化轴 RF 批次、切片和命令级任务，并由 `v54-implementation-batches.md` 授权。

## 12. 本轮证据边界

本轮只有 DOC/GOVERNANCE 证据：未启动服务、未调用模型、未安装依赖、未改变 ReleaseIdentity、未写正式账本、未发布、未执行 LIVE_E2E。
