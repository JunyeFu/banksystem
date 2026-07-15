# 转账闭环五页面重建实施计划

权威设计输入为 [`docs/design/frontend/transfer-five-page-bidirectional-adjustment.md`](../../../docs/design/frontend/transfer-five-page-bidirectional-adjustment.md)。本计划只编排实施批次，不覆盖 OpenAPI、ADR 或当前能力矩阵。

## 范围

- 客户端：转账列表、新建转账、转账结果。
- 运营端：支付监控、支付详情。
- 依赖能力：收款人解析、客户/运营转账读模型、生成客户端、最小 UI Kit、契约与视觉测试。
- 不包含：新增 OTP 页面、审批队列重建、衡准平台页面、Fineract 直连、外部管理后台换肤。

## 批次

| 批次 | 目标 | 允许主要路径 | 验收门禁 | 当前状态 |
|---|---|---|---|---|
| FTR-0 | 契约与安全读模型 | `contracts/openapi/**`、转账/收款人 Controller、Liquibase、Java tests | 目标 operationId、收款人解析、客户 ownership、运营角色、迁移与回滚测试通过 | OpenAPI、33 项 Java 测试和真实 Docker Liquibase 升级已通过；角色 E2E、实库回滚仍待执行 |
| FTR-1 | 生成客户端与最小 UI Kit | `packages/bank-api-client/**`、`packages/bank-domain-types/**`、`packages/bank-ui-kit/**` | OpenAPI 生成无漂移；Token、状态、金额、页面状态组件有测试和 Storybook/页面 Fixture | 生成客户端、10 项包测试和确定性页面 Fixture 已完成；采用页面 Fixture 而非 Storybook |
| FTR-2 | 客户三页 | `apps/customer-portal/**` | PV-0021–PV-0038 对应状态、创建到终态、回单和负向流程通过 | 18 个 PV 状态、日期筛选、整行导航、创建→终态和 PDF 回单均有 Playwright 证据；真实角色 E2E 待执行 |
| FTR-3 | 运营两页 | `apps/operations-console/**` | PV-0072–PV-0089 对应状态、筛选、详情、事件失败和权限流程通过 | 18 个 PV 状态、五类筛选、全量聚合、CSV 导出、详情和事件失败均有 Playwright 证据；权限矩阵待执行 |
| FTR-4 | 跨端验收 | `tests/**`、`docs/evidence/**` | 客户创建→运营观察→客户终态/回单闭环，契约、无障碍和视觉证据齐全 | 40 项 Playwright、36 张固定视觉基线及 Docker 服务 Smoke 已通过；真实带角色金融 E2E、回滚和正式基线审批待完成 |

## 文件与数据规则

- 不直接修改 Fineract 数据库；银行渠道表变更只能使用 Liquibase。
- 原预览 PNG 保持设计输入，不进入普通 RAG；清单记录文件名、PV、SHA-256和逻辑状态。
- Storybook/Playwright Fixture 使用虚构数据，金额和状态必须符合 OpenAPI。
- Outbox 详情只暴露安全元数据，不返回 payload、headers 或运行凭据。
- 五页不再新增手写 API DTO 和字符串路径；生成代码的来源必须可追溯到 OpenAPI。

## 执行依赖

```text
FTR-0 -> FTR-1 -> FTR-2 -> FTR-3 -> FTR-4
```

FTR-2 与 FTR-3 只有在 FTR-1 的生成客户端和组件契约冻结后才可并行。不能以静态 Mock 页面绕过 FTR-0；Mock 必须由已接受 OpenAPI 生成或验证。

## 最低验证命令

```powershell
uv run python scripts/docs/validate_docs.py
services/bank-channel-service/mvnw.cmd test
npm.cmd run build --prefix apps/customer-portal
npm.cmd run build --prefix apps/operations-console
```

实施时还必须补充 OpenAPI lint/生成漂移、前端单元测试、Storybook、Playwright、视觉差异、权限负向、幂等回放、数据库迁移/回滚和 Docker Smoke。任何一项未运行必须记录具体原因，不能把计划状态直接改为 `DONE`。
