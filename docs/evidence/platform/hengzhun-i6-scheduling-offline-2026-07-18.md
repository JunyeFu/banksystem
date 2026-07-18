---
id: EVIDENCE-HENGZHUN-I6-20260718
title: 衡准 I6 确定性调度与离线交付验收证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.1
effective_date: 2026-07-18
owner: 傅钧烨
---

# 衡准 I6 确定性调度与离线交付验收证据

## 1. 公正结论

I6 本机运行面、离线交付和 Coze 唯一自然语言入口均已完成真实验收。公开 Coze Agent 已完成“创建 -> 查询 -> 显式停用 -> 再次查询”闭环，因此本机与 Coze 演示范围内的 I6 退出门禁关闭。

## 2. 已验证的本机能力

- 唯一 `regression_platform.sqlite` 已应用 schema version 8；Schedule、触发执行、失败暂停和恢复决策均由 Harness 持有。
- Cron 只接受五字段表达式并要求 IANA 时区；首版环境只接受 `local`。
- 同一 `environment + fixtureScope` 最多存在一个 `QUEUED/RUNNING` 运行；冲突形成 `SKIPPED_MUTEX`，不并发执行。
- `SKIP` 跳过超出宽限期的触发；`RUN_ONCE` 将停机期间旧触发合并为一次补跑；重启后不会重复创建同一触发。
- 正式 Schedule 创建前校验 `SCRIPT_VALIDATED`；正式执行只排队确定性 Playwright，不调用 LLM、Midscene 或视觉模型。
- 仅瞬态基础设施故障按配置有限重试；最终失败暂停 Schedule，并要求用户以当前版本提交 `SCHEDULE_RECOVERY` 才能恢复。
- OpenAPI 已扩展为 14 个公开工具，新增 `schedule_create`、`schedule_get`、`schedule_disable`。

`npm run test:i6` 通过 5/5：离线清单、Cron/时区、misfire/互斥、瞬态重试/失败暂停/人工恢复、重启去重全部通过。Docker Harness 使用 `hengzhun/harness:i6-local`，健康状态为 `healthy`，服务版本为 `1.1.0`。

## 3. 离线交付演练

2026-07-18 使用真实本机镜像完成一次包含镜像的离线打包和恢复演练：

- 包含 Harness、Model Gateway、Conformance 三张固定标签镜像的 image tar；
- 生成文件 Hash 清单、CycloneDX SBOM、SQLite 在线备份以及 Artifact/Evidence 归档；
- 产品归档显式排除 `.data`、`.env`、profiles 环境文件、日志、缓存和测试运行产物；
- 在全新目标目录恢复产品、加载三张镜像并复验全部 Hash；
- 恢复后的 SQLite `integrity_check` 通过，schema version 为 8。

离线包和恢复目录均位于 Git 忽略的 `.data/`，不提交镜像、运行数据库、日志、截图或原始证据。

## 4. Coze 公开界面结果

- Harness 插件：资源 ID `7663393319640104960`，14 个工具在修订契约后全部重新通过公开试运行，发布版本 `v0.0.10`。
- 新建 Agent：`衡准-I6-调度主控`，资源 ID `7663830455396859904`，已绑定 14 个工具并发布到 API 与 Chat SDK。
- 新建 Knowledge Base：`衡准-I6-调度与离线规则知识库`，资源 ID `7663832211321257984`；规则文档已完成处理、分段并以全文检索模式绑定 Agent。
- 未使用 Coze 私有管理 API、平台数据库直写或容器挂载发布。

初次失败由两项缺口共同造成：模型网关未向 MiMo 明示原生工具调用协议，且 `schedule_get` 成功响应只有空对象 Schema，导致 Coze 丢弃真实字段。修复后，Agent 按单意图单工具规则调用 Harness，并完成以下真实闭环：

- 自然语言创建 Schedule `schedule_6e85fe1b-64b9-4e48-96a1-f3e05eb95ef2`，初始为 `ACTIVE/version 1`；
- 自然语言查询返回 Cron、时区、环境、fixture、下次触发时间和版本等真实字段；
- 用户明确要求停用后返回 `DISABLED/version 2`，`replayed=false`；
- 再次自然语言查询仍返回 `DISABLED/version 2`，证明状态由 Harness 持久化且不是模型模拟。

Agent 已重新发布到 API 与 Chat SDK。工具协议提示只在请求携带工具定义时注入，不包含凭据、运行数据或业务状态；Harness 仍是唯一状态权威。

## 5. 外部环境待验证项与风险

- `PLAT-V007` 的目标租户容量、并发和退避限制仍待目标环境验证。
- `PLAT-V010` 的云端 HiAgent 域名、TLS、DNS、私网路由和鉴权仍待实际目标版本验证。
- 当前离线恢复验证覆盖制品、镜像加载和 SQLite 完整性；由于凭据文件按安全要求不进入离线包，恢复后带真实上游配置的业务启动应在目标内网使用现场注入配置另行验收。

上述两项属于未来目标 HiAgent 环境的迁移与容量验收，不反向否定本机 Coze 演示闭环，也不作为 I6 本地完成状态的阻塞项。
