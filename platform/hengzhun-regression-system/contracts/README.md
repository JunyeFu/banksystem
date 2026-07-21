# Harness 契约

`openapi/hengzhun-harness-v1.yaml` 是 I2 七工具的版本化 OpenAPI 3.0.3 契约，固定包含：

公开插件现有 14 个工具：`case_create_draft`、`case_get`、`case_import_submit`、`plan_compile`、`run_submit`、`task_get`、`artifact_get_metadata`、`decision_submit`、`failure_get`、`repair_candidate_create`、`repair_candidate_get`、`schedule_create`、`schedule_get`、`schedule_disable`。

契约已通过无副作用静态导入校验：操作名唯一、方法与路径完整、Bearer 安全方案存在、服务地址固定为内部 Docker DNS、文件小于 2 MiB。当前 Coze Studio 公开界面仍未完成真实导入；发布和真实调用必须在 I3 关闭 `PLAT-V004` 后才能声明可用。

`openapi/hengzhun-worker-internal-v1.yaml` 1.5.0 在阶段1作者化和阶段3候选构建契约基础上，新增阶段4稳定性Claim/Completion、固定六样本、证据描述和运行时指纹Schema，共11项内部操作。它只供受控本机Worker，不导入Agent平台，也不暴露凭据、SQLite或任意执行能力。

`mcp/hengzhun-i8.json` 7.0.0 冻结 I8 的 14 个 Agent 平台业务工具名和阶段状态。阶段7已全部启用；`failure_get`只返回脱敏失败封装，`repair_propose`只接受受限补丁 Schema，`decision_submit`只处理已完成六轮稳定性验证的修复提案。任何工具仍不得提供任意文件、SQL、Shell、浏览器或 URL 能力。
