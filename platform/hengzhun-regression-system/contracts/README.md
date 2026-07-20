# Harness 契约

`openapi/hengzhun-harness-v1.yaml` 是 I2 七工具的版本化 OpenAPI 3.0.3 契约，固定包含：

公开插件现有 14 个工具：`case_create_draft`、`case_get`、`case_import_submit`、`plan_compile`、`run_submit`、`task_get`、`artifact_get_metadata`、`decision_submit`、`failure_get`、`repair_candidate_create`、`repair_candidate_get`、`schedule_create`、`schedule_get`、`schedule_disable`。

契约已通过无副作用静态导入校验：操作名唯一、方法与路径完整、Bearer 安全方案存在、服务地址固定为内部 Docker DNS、文件小于 2 MiB。当前 Coze Studio 公开界面仍未完成真实导入；发布和真实调用必须在 I3 关闭 `PLAT-V004` 后才能声明可用。

`openapi/hengzhun-worker-internal-v1.yaml` 1.3.0 冻结I8阶段1内部作者化Claim、严格`ActionContextEnvelope`、Envelope Hash、上下文审计引用和模型usage完成回执。它只供受控本机Worker，不导入Agent平台，也不暴露凭据、SQLite或任意执行能力。

`mcp/hengzhun-i8.json` 冻结I8的14个Agent平台业务工具名和阶段状态。阶段2仅`case_prepare`、`authoring_submit`、`authoring_get`为ACTIVE，其余工具必须返回`I8_STAGE_CAPABILITY_NOT_AVAILABLE`，不得用占位成功冒充后续阶段能力。
