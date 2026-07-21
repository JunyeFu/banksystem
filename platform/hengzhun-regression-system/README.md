# 衡准自动化回归测试系统

本目录是项目自有自动化回归系统的唯一产品根目录。复兴银行被测系统仍在本目录之外；HiAgent 是云端目标平台，不在这里复制或部署。

## 当前状态

I9 P1—P2 已完成：Windows 原生 Flowise 3.0.12 正式运行树、Bundled Node 20.20.2、Chromium 1217、依赖锁和完整目录 Hash 已冻结；Harness、MCP、Worker、Flowise 已具备产品自有的准备、正序启动、独立健康检查、PID 归属、反序停止、幂等启动、未知端口占用拒绝和部分失败清理。P3 尚未通过公开流程初始化平台知识、模型和 MCP 连接，因此当前只可称“四服务运行底座可用”，不能称正式 Agentflow 或完整自动化回归平台可用。

I1 的单目录产品边界、固定运行时、结构校验、合成一致性服务、OpenAPI 样例、本机 Coze Studio 0.5.1、受控 Docker 网络、最小 Agent、Knowledge Base 和 Workflow 已真实落地。I2 的 TypeScript/Node Harness、SQLite 单库、首版七工具 OpenAPI、Bearer/allowlist、安全审计、幂等、输出预算和 Artifact 元数据内核也已落地。I3 完成 SQLite 状态、Playwright Worker、MiMo 兼容网关、门户登录与资料一致性、七工具调用、会话恢复和知识检索。I4 已完成三条确定性案例、三动作窗口、Midscene 原子能力门禁、人工脚本激活门禁以及 Coze 公开界面恢复与发布。

I5 已完成结构化案例导入、七类失败分类、定位器脚本失效诊断、白名单修复候选、隔离 Playwright 验证和人工确认激活。Coze Studio 0.5.1 已仅通过公开界面发布十一工具插件 v0.0.7、I5 Knowledge Base 与主控 Agent；自然语言批准真实改变 SQLite 权威状态，`repair_candidate_get` 回查为 `ACTIVE/version 4`，关联事故为 `RESOLVED/version 4`。使用旧版本的重复批准被 409 安全拒绝，没有发生第二次状态变更。

I8 当前处于实施中。阶段1—4已完成上下文内核、Agentflow/MCP交接、确定性Builder和6次稳定性证书；阶段5已完成migration 013、持证分页预览、一次性下载、SAVE_ONLY/ACTIVATE/REJECT、精确版本激活及纯Playwright按需执行。真实复兴银行门户已完成6次签证后预览、激活和正式复跑。MCP现有8项工具ACTIVE、阶段6—7的6项失败关闭；尚未发布运行中Agentflow、完成真实MiMo对话或实现阶段6—7调度/收件箱/修复闭环。

## 目录职责

| 路径 | 职责 | 当前声明 |
|---|---|---|
| `coze/` | 可公开上传或导入的 Skill、插件和界面配置制品 | I5 十一工具、运行知识、主控 Agent、Workflow 与 Skill 已经公开配置并完成真实入口验收 |
| `harness/` | API、安全、任务、状态机、SQLite 与证据控制层 | I5 导入批次、事故、诊断、修复候选、验证和激活决策全部由 SQLite 管理 |
| `worker/` | Playwright 正式执行与 Midscene 作者化适配 | I5 新增隔离修复候选验证；正式回归仍仅执行已验证 Playwright 脚本 |
| `model-gateway/` | MiMo 非流式上游到 Coze OpenAI SSE 的受控兼容层 | 内部网络、Bearer、无宿主端口；不保存领域状态 |
| `runtime/` | 固定 Node、Chromium 与本地依赖 | 已迁移副本，需通过校验 |
| `contracts/` | Harness OpenAPI 与数据契约 | 十一工具 OpenAPI 3.0.3 与内部修复 Worker 契约已版本化并通过静态校验 |
| `tests/` | 单元、契约、集成、E2E 与平台一致性测试 | I2-I5 共 24 项自动测试和 I5 真实浏览器闭环已通过 |
| `scripts/` | 准备、启动、停止、验证和离线打包入口 | I1-I5 准备、启停、静态与真实运行验证入口已落地 |
| `docs/` | 产品目录内部说明 | 仅辅助设计，不定义项目顺序 |
| `.data/` | SQLite、日志、证据和运行数据 | 本地生成，禁止入库与 RAG |

项目级实施顺序只读取 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md)。

## I9 Windows 原生四服务生命周期

运行前只在当前进程或受控本机配置中注入以下环境变量，不要把值写入仓库：

- `HENGZHUN_SERVICE_TOKEN`：至少32字符；Harness服务通道。
- `HENGZHUN_WORKER_TOKEN`：至少32字符；Worker内部通道。
- `HENGZHUN_MCP_TOKEN`：至少24字符；MCP调用通道。

在产品目录执行：

```powershell
npm.cmd run prepare:i9
npm.cmd run start:i9
npm.cmd run status:i9
npm.cmd run stop:i9
```

启动顺序固定为Harness → MCP → Worker → Flowise，停止顺序相反。健康时`status:i9`返回四项`owned=true/healthy=true`及`http://127.0.0.1:3006`；停止后返回`NOT_RUNNING`。运行数据库、PID、心跳和日志只写入`.data/`。脚本不终止无法证明归属的进程，也不读取或输出凭据原文。

## 验证

在本目录执行：

```powershell
.\verify.cmd
```

`verify.cmd` 执行 I1-I5 静态与自动测试基线。I5 完整验收执行 `npm run verify:i5`，会进一步运行十一工具契约、Docker/SQLite 迁移、受控定位器失败刺激、真实 Chromium 隔离候选验证、人工决策门禁和激活后正式复跑。凭据只从忽略的运行配置解析为别名，脚本不输出原文。公开界面结论仍只以当次 UI 验收为准，不从本地文件存在性推断。

I8 阶段1执行 `npm.cmd run verify:i8:stage1`，覆盖严格Schema、migration 009、CTX升级、视觉/主控预算、usage超限失败关闭、Worker契约和I4兼容回归。

I8 阶段2执行 `npm.cmd run verify:i8:stage2`，覆盖阶段1回归、migration 010、准备/确认/查询状态、Flowise 3.0.12节点兼容、Agentflow禁止节点、MCP认证、14工具白名单和真实Flowise MCP Client到Harness/SQLite集成。

I8 阶段3执行 `npm.cmd run verify:i8:stage3`，覆盖阶段1/2回归、migration 011、严格执行计划、有限DSL、确定性Builder、来源链/Hash、候选持久化、Flowise `candidate_get` 和Worker篡改/危险能力拒绝。该门禁使用受控Fake Page验证执行契约，不替代阶段4真实Chromium稳定性验证。

I8 阶段4执行 `npm.cmd run verify:i8:stage4`，覆盖阶段1—4回归、migration 012、固定六样本、真实内置Chromium、失败不重试/不签证、证据Hash和常驻Worker轮询契约。已启动复兴银行本机演示栈时，可再执行 `npm.cmd run verify:i8:stage4:live` 完成真实门户6/6验收；脚本从忽略的运行时配置读取凭据且不输出凭据。

I8 阶段5执行 `npm.cmd run verify:i8:stage5`，覆盖阶段1—5累计回归、migration 013、持证Hash复核、分页/一次性下载、三种人工决策、并发版本冲突、激活不自动运行、按需纯Playwright执行和8/6 MCP门禁。演示栈启动时执行`npm.cmd run verify:i8:stage5:live`，会对真实门户完成六次签证、预览、精确激活和正式复跑；不创建任何调度。

I9 P2静态/契约验证执行`npm.cmd run verify:i9:stage2`；真实生命周期验收执行`npm.cmd run verify:i9:stage2:live`，覆盖未知端口占用不杀进程、弱Token失败关闭、部分启动失败清理、四服务健康、重复启动幂等、反序停止、两套SQLite`quick_check`和重启恢复。验收结束后四服务保持停止。
