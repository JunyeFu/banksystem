---
id: EVIDENCE-HENGZHUN-I5-20260717
title: 衡准 I5 结构化导入与隔离修复闭环验收证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.1
effective_date: 2026-07-17
owner: 傅钧烨
---

# 衡准 I5 结构化导入与隔离修复闭环验收证据

## 1. 当前结论

I5 本机运行面和 Coze 唯一自然语言入口均已验收。Coze Studio 0.5.1 仅通过公开界面发布十一工具插件 v0.0.7、I5 Knowledge Base 和主控 Agent；自然语言批准真实改变 SQLite 权威状态，随后公开工具只读回查与数据库一致。I5 退出门禁关闭。

## 2. 已实现能力

- `case_import_submit` 只接受 `HENGZHUN_JSON_V1`，每批 1—50 项；批次内 `externalCaseRef` 唯一，任一项不合法时整批不写入。
- 运行失败后由 Harness 在 SQLite 中创建 `failure_incidents`，确定性分类为环境、认证、契约、定位器、断言、模型或工具。
- 首版自动诊断只为受支持的定位器失败代码生成白名单 `LOCATOR_OVERRIDE`；未知模板和非定位器分类拒绝生成候选。
- 修复候选、验证任务、验证证据、激活决定和脚本配置版本全部保存在唯一 `regression_platform.sqlite`。
- 候选在独立租约、全新 BrowserContext 和 `NO_COMMIT` 隔离模式下验证；通过后停在 `WAITING_USER`，不会自动激活。
- 显式 `REPAIR_CANDIDATE_ACTIVATION/APPROVE` 且候选版本一致后，脚本版本才从 1 变为 2；随后正式 Playwright 回归再次通过。

## 3. 自动与真实运行结果

`npm run verify:i5` 于 2026-07-17 通过：

- OpenAPI 3.0.3：11 个公开 Operation，22,343 字节，Bearer Token；
- I2：13/13；I3：7/7；I4：3/3；I5：2/2；
- Docker Harness 成功应用迁移 `006_i5_repair_loop.sql`，SQLite 完整性检查通过；
- 受控失败刺激形成 `LOCATOR` 事故；该刺激明确标记为合成 Worker 输入，不声称来自真实页面随机失效；
- 修复候选真实调用固定 Chromium 和门户，在隔离 BrowserContext 中通过；
- 用户决策前 `WAITING_USER`，决策后 `ACTIVE`，`automaticActivation=false`；
- 激活后正式复跑 `SUCCEEDED`，报告 `redactionStatus=REDACTED`。

运行态结果文件 SHA-256：`48feeed5659639e5998ccbb6f3b1cafe5b264a260a83a1480d2cfe862b3af391`。原始 SQLite、日志、截图与运行结果仅保存在忽略的 `.data/`，不提交仓库。

## 4. 安全与范围

- Coze/HiAgent 只看到公开插件短响应，不接触 SQLite、文件系统、凭据、浏览器或 Artifact 字节。
- Worker 只执行白名单脚本路径和结构化选择器覆盖，不接受 Agent 生成的任意代码或命令。
- 候选验证报告、截图和日志必须脱敏；通过至少要求三类证据。
- 正式运行继续只接受 `SCRIPT_VALIDATED`，本批不实现调度、视频拆帧、语言修复或衡准 UI。

## 5. Coze 公开入口验收

- 插件：`衡准回归 Harness`，公开资源 ID `7663393319640104960`，发布版本 `v0.0.7`，共 11 个工具。
- 主控 Agent：`衡准-I5-回归主控`，公开资源 ID `7663383450732199936`，已绑定十一工具和 I5 Knowledge Base 并发布。
- 运行知识库：`衡准-I5-导入失败诊断与修复规则`，资源 ID `7663445954883747840`，1 份文档、2 个分段，已绑定。
- 自然语言批准调用 `decision_submit` 后，SQLite 候选变为 `ACTIVE/version 4`，关联事故变为 `RESOLVED/version 4`。
- 重新绑定并发布 `repair_candidate_get` 后，从同一 Agent 只读回查得到 `status=ACTIVE`、`version=4`、基础脚本版本 1、候选脚本版本 2、关联事故 ID 一致；`validation` 为无额外数据的空对象，未虚构验证字段。
- Coze 随后一次使用旧 `expectedVersion` 的重复批准被 Harness 以 HTTP 409 `TARGET_VERSION_CONFLICT` 拒绝，证明乐观并发门禁阻止重复激活。
- 公开 Coze 适配使用静态 `X-Hengzhun-Service-Token`；规范 OpenAPI 和 HiAgent 迁移路径仍以 `Authorization: Bearer` 为主。两条路径都只在 Harness 鉴权层处理，证据不保存令牌原文。

未使用 Coze 私有管理 API、数据库直写或容器挂载发布。Coze 界面结论与 SQLite 权威查询同时成立，因而不是本地制品存在性推断。

## 6. 已知运行风险

Coze 模型可能在一次对话中重复尝试同一有副作用工具。当前幂等键和目标版本共同保护状态；I6 还应把“工具成功后立即停止同类调用、409 后只读刷新”固化为 Workflow 分支和重试策略。
