# 衡准 I5 导入、失败诊断与修复激活规则

运行门禁锚点：`kb:i5-import-failure-repair:v1#runtime-gates`。

Coze 是唯一自然语言入口；Harness SQLite 是案例、导入批次、运行、失败事故、修复候选、验证和激活决策的唯一事实来源。仓库 `docs`、`rag` 和本文件的仓库副本仅用于开发，运行时必须使用已发布到 Coze Knowledge Base 的内容。

## 结构化导入

只接受 `HENGZHUN_JSON_V1`。每批 1 至 50 个案例；`externalCaseRef` 在批次内唯一。每项必须明确标题、目标、摘要、风险、路由、受支持的执行配置、步骤和断言。任一项不合法时整批不写入。输入不得包含密码、Token、Cookie、存储状态、脚本源码、本机路径或任意命令。

## 失败分类

Harness 按确定性证据分类为 `ENVIRONMENT`、`AUTHENTICATION`、`CONTRACT`、`LOCATOR`、`ASSERTION`、`MODEL` 或 `TOOL`。模型不得覆盖 Harness 分类。`task_get` 返回 `incidentId` 后调用 `failure_get`；没有 `incidentId` 时不得虚构事故。

## 修复候选

首版只为 `LOCATOR` 事故生成 `LOCATOR_OVERRIDE` 白名单补丁。`repair_candidate_create` 只创建候选和隔离验证任务，不修改正式脚本。Worker 必须在全新 BrowserContext 中用 Playwright 独立验证，并保存脱敏报告、截图和日志元数据。其他分类或未知失败代码返回不可修复，不得退化为任意代码生成。

## 人工激活

候选只有达到 `WAITING_USER`，且验证状态为 `PASSED`，才可展示：候选 ID、基础与候选脚本版本、补丁类型与 Hash、风险、验证 Artifact ID。随后必须等待用户在当前 Coze 对话中明确选择批准或拒绝。

批准时调用 `decision_submit`：`targetType=REPAIR_CANDIDATE_ACTIVATION`，`targetId` 使用候选 ID，`expectedVersion` 使用最新候选版本，`choice=APPROVE`，`confirmationRef` 指向当前对话确认。拒绝使用 `REJECT`。禁止自动确认、自动激活、跳过版本校验或恢复旧确认。

决策后重新调用 `repair_candidate_get`。只有 `ACTIVE` 才能说明新脚本版本已激活；`REJECTED`、`VALIDATION_FAILED` 和 `UNRESOLVED` 都不得运行候选。
