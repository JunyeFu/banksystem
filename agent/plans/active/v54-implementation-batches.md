# V5.4 平台实施批次

本计划依据 [`docs/architecture/decision-log/v54-decision-register.md`](../../../docs/architecture/decision-log/v54-decision-register.md)。每批开始前仅确认该批尚未冻结的实现参数；完成后须通过该批验收才进入下一批。

| 批次 | 范围 | 核心交付 | 进入下一批的门槛 |
|---|---|---|---|
| B0 | 平台基线与品牌映射 | `platform/` workspace、版本锁、Compose Overlay、数据库初始化、Keycloak Client/角色、Gateway 路由、CI 骨架、共享品牌配置/术语映射 | 隔离数据库、最小服务、门户登录、品牌配置可加载、迁移与 CI Smoke 通过 |
| B1 | Case 与 Baseline | Quality Case API、版本模型、Schema/OpenAPI、批准流、Quality Case Portal | 三个案例可创建、版本化、批准、查询和导出 |
| B2 | Artifact 与 Evidence | Artifact Registry、Evidence 元数据/Volume、受控下载、视频队列状态、保留与清理 | ZIP 安全、鉴权下载、Hash、审计和清理验证通过 |
| B3 | 确定性验证 | Script Package、静态门禁、隔离 Playwright Worker、Fixture/Storage State、Baseline Comparator | 三个案例独立验证、业务断言与证据闭环通过 |
| B4 | 定时回归 | Schedule、环境锁、Outbox/Worker、Regression Run、失败暂停与 Incident | Cron、并发锁、失败暂停、重试和恢复入口通过 |
| B5 | Codex 知识与作者控制 | Knowledge Service、GPT Authoring Adapter、Prompt/Plan Harness、FullActionPlan、ActionEventStore | Fake Adapter 与 Codex/GPT 作者化链可重放、可审计 |
| B6 | Codex 视觉与执行 | 本机 Midscene/Playwright 集成、GPT 模型 Profile、截图安全门禁、受控高风险提交 | Codex/GPT Smoke、脱敏、模型最小调用与独立验证通过 |
| B7 | 恢复与交付 | 两路径恢复、通知、Benchmark、备份恢复、Release Evidence | 失败到恢复到重新验证的闭环和临时目标恢复通过 |

## B0 允许范围

```text
platform/**
compose.platform.yaml
compose.authoring.yaml
infra/gateway/**
infra/keycloak/**
scripts/platform/**
.gitignore
.github/workflows/**
infra/versions.lock.yaml
infra/images.lock.txt
agent/plans/active/v54-*.md
docs/architecture/**
docs/design/**
```

禁止在 B0 修改银行业务 Controller、FineractAdapter、银行 Liquibase、银行业务表或既有门户功能。B0 不运行真实 Provider、不创建 Case/Baseline 业务数据，也不读取任何 Secret 内容。

## 本机演示强制边界

本演示系统的一切运行时操作均由本机容器/Worker 完成；Codex 负责受控开发与作者化，GPT LLM 仅处理最小化、脱敏的推理上下文。浏览器自动化、脚本生成、验证、调度、证据、审计、通知和恢复不得交给外部 Agent、外部 Webhook 或云端 Task Relay。GPT LLM 不得直接执行任何银行或浏览器操作，也不得获得工具或运行时凭据。该 Codex/GPT 链路是 B5-B6 的演示验收依赖。

## B0 品牌同步交付

- 在 `platform/` 共享配置中建立唯一品牌事实来源：银行产品中文名为“复兴银行数字银行系统”，银行子系统统一使用“复兴银行 + 系统/门户/控制台/中心名称”；测试平台中文名为“衡准自动化回归测试平台”；同时提供英文展示名与简短产品描述。
- 为 API、数据库、Docker 服务、Volume、网络、Java package、TypeScript package 和既有路由建立术语映射；这些技术标识在 B0 保持兼容，不以品牌名重命名。
- B0 更新 README、架构总览、演示标题和新建 Quality Case Portal 骨架的可见文案。既有 Customer Portal 与 Operations Console 的显示名称随前端重构批次迁移，不能在 B0 改动其业务功能。
- B0 接入 `docs/design/frontend/design-system.md` 规定的本机前端设计资料库：IBM/金融产品/工作台设计资料仅用于形成项目 Token、无障碍和组件组合约束；现有门户继续以 Ant Design 为唯一主组件库，不复制参考品牌资产或混入 shadcn/ui 实现。
- 验收：配置可被平台门户和报告模板加载；对外资料使用“复兴银行/衡准”；技术资源名和既有 API 契约不变；历史审计、证据和冻结方案只增加术语说明，不批量改名。

## 固定质量门

每批均执行：范围审查、JSON Schema/OpenAPI、TypeScript strict/Lint、SQL migration、单元测试、集成测试、权限测试、敏感数据检查、容器 Smoke、回滚说明和证据报告。

`B3` 及后续额外执行：独立 BrowserContext、Fixture namespace 清理、Artifact/Evidence Hash、业务断言、Baseline 比较和 Worker 隔离验证。
