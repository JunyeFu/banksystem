# V5.4 平台实施批次

本计划依据 `v54-decision-register.md`。每批开始前仅确认该批尚未冻结的实现参数；完成后须通过该批验收才进入下一批。

| 批次 | 范围 | 核心交付 | 进入下一批的门槛 |
|---|---|---|---|
| B0 | 平台基线 | `platform/` workspace、版本锁、Compose Overlay、数据库初始化、Keycloak Client/角色、Gateway 路由、CI 骨架 | 隔离数据库、最小服务、门户登录、迁移与 CI Smoke 通过 |
| B1 | Case 与 Baseline | Quality Case API、版本模型、Schema/OpenAPI、批准流、Quality Case Portal | 三个案例可创建、版本化、批准、查询和导出 |
| B2 | Artifact 与 Evidence | Artifact Registry、Evidence 元数据/Volume、受控下载、视频队列状态、保留与清理 | ZIP 安全、鉴权下载、Hash、审计和清理验证通过 |
| B3 | 确定性验证 | Script Package、静态门禁、隔离 Playwright Worker、Fixture/Storage State、Baseline Comparator | 三个案例独立验证、业务断言与证据闭环通过 |
| B4 | 定时回归 | Schedule、环境锁、Outbox/Worker、Regression Run、失败暂停与 Incident | Cron、并发锁、失败暂停、重试和恢复入口通过 |
| B5 | 知识与作者控制 | Knowledge Service、Prompt/Plan Harness、FullActionPlan、ActionEventStore、Task Relay | 无模型 Fake Adapter 可重放、可审计地完成作者链 |
| B6 | 真实 AI 与视觉 | Coze Adapter、Visual Model Adapter、Midscene、Local Bridge、截图安全门禁 | Provider Smoke、脱敏、受控高风险提交、独立验证通过 |
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
agent/v54-*.md
```

禁止在 B0 修改银行业务 Controller、FineractAdapter、银行 Liquibase、银行业务表或既有门户功能。B0 不运行真实 Provider、不创建 Case/Baseline 业务数据，也不读取任何 Secret 内容。

## 固定质量门

每批均执行：范围审查、JSON Schema/OpenAPI、TypeScript strict/Lint、SQL migration、单元测试、集成测试、权限测试、敏感数据检查、容器 Smoke、回滚说明和证据报告。

`B3` 及后续额外执行：独立 BrowserContext、Fixture namespace 清理、Artifact/Evidence Hash、业务断言、Baseline 比较和 Worker 隔离验证。
