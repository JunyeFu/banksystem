# Harness 契约

`openapi/hengzhun-harness-v1.yaml` 是 I2 七工具的版本化 OpenAPI 3.0.3 契约，固定包含：

`case_create_draft`、`case_get`、`plan_compile`、`run_submit`、`task_get`、`artifact_get_metadata`、`decision_submit`。

契约已通过无副作用静态导入校验：操作名唯一、方法与路径完整、Bearer 安全方案存在、服务地址固定为内部 Docker DNS、文件小于 2 MiB。当前 Coze Studio 公开界面仍未完成真实导入；发布和真实调用必须在 I3 关闭 `PLAT-V004` 后才能声明可用。
