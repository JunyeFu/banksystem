# V5.4 外网演示完整产品规划 Track

> 状态：规划基线，非实现完成证明
> 更新：2026-07-14
> 2026-07-16 修订：本文只描述产品范围，不定义实施先后。唯一实施顺序见 [`v54-implementation-batches.md`](v54-implementation-batches.md)；最新职责边界见 [`docs/architecture/overview/coze-harness-midscene-observability-boundary.md`](../../../docs/architecture/overview/coze-harness-midscene-observability-boundary.md)，衡准实现已暂缓。
> 2026-07-20 修订：本文的 Track B 仅保留 I0—I7 历史范围；I8 当前平台、工具和知识边界见 [`flowise-sqlite-hiagent-regression-baseline-v1.md`](../../../docs/architecture/overview/flowise-sqlite-hiagent-regression-baseline-v1.md)，不得继续按下文 Coze 目标新增能力。

## 目标

在外网隔离环境演示完整的开源银行系统与完整回归测试平台；评审通过后，在不降低功能和安全门禁的前提下迁移到公司内网。

## Track 划分

### Track A：银行核心目标系统

继续使用当前 S0-S7 计划、Fineract 唯一账务事实源、Bank Channel Service、Customer Portal、Operations Console、Mifos X、资金安全、审计、对账、恢复和现有质量门禁。V4 落地继续满足 [`v4-v54-compatibility-baseline.md`](../../../docs/architecture/v4-v54-compatibility-baseline.md)。实习阶段只按首批案例需要收敛银行目标，不要求 Track A 全部完成后才启动 Track B。

### Track B：Coze 编排、Harness 工具链与衡准观测

Track B 是当前实习交付主线，与 Track A 的案例级修复并行启动。

按 v5.4 四阶段推进：

1. Coze 自定义 Agent/Workflow 接收自然语言、格式化案例和视频，负责知识、澄清、计划、任务控制和恢复编排；
2. Harness 提供结构化工具、任务状态、安全门禁、三动作窗口、Midscene视觉 Agent、Playwright事实采集与脚本验证；
3. Playwright 已验证脚本承担正式定时回归，失败后重新进入 Coze 编排的诊断与作者化链；
4. 衡准在未来恢复后只读展示运行、指标、失败、修复、证据、环境和发布质量，不承担 Agent 支持或写控制；
5. Coze/Harness 核心完成后再进行基准评测、安全、交付和迁移准备。

## 状态规则

- 当前银行核心状态不得因 v5.4 目标文档变更而自动变为 DONE。
- v5.4 平台能力使用 `PLANNED`、`POC_VERIFIED`、`LOCALLY_VERIFIED`、`PENDING_ENTERPRISE_VALIDATION`、`ACCEPTED`。
- 正式定时回归只执行 `SCRIPT_VALIDATED` 脚本，不调用 LLM、Midscene 或视觉模型。
- Codex 只负责项目开发，不属于运行时作者化、编排或执行链。
- Harness 的 SQLite `regression_platform` 数据库是测试领域唯一事实来源；Coze只保存 Agent 配置、会话和 Workflow 编排状态，衡准只读。SQLite是新建平台持久化的唯一数据库引擎，使用 WAL、外键、单写入队列、备份与完整性校验，数据库文件不入库；既有 Fineract/Mifos和银行渠道 PostgreSQL 核心依赖不在替换范围。
- Coze Knowledge Base 是运行时唯一知识权威；仓库 `docs/ + rag/` 仅用于项目开发、审计和Codex维护。
- 已冻结：Harness Schedule、自托管 Coze Studio + HTTP OpenAPI Plugin、服务令牌 + 内网 allowlist、脱敏截图外发/内网本地视觉模型、人工激活、衡准全路由只读、五类导入 + Adapter SDK、本机视频处理 + Artifact ID、`namespace + runId`、Harness outbox 投影、版本化离线包与独立 v5.4 验收矩阵。衡准实现保持暂停，不维护旧 B0-B7 排期。
- v5.4 目标计划不授权直接修改银行核心数据库、既有 Liquibase changeset、现有 API 契约或生产凭据。

## 外网演示门槛

- 仅使用虚构或脱敏数据；
- 外部入口必须经过 TLS 边界和最小权限认证；
- Fineract、数据库、ActiveMQ、内部 Worker 和凭据不直接暴露；
- 全部脚本生成、验证、Baseline、证据、审计、通知和失败恢复链路可追溯；
- 评审后只替换平台、模型、质量平台、企业认证、通知和网络适配，不删除安全与验收门禁。
