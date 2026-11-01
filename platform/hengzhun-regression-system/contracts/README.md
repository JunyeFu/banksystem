# Harness 契约

2026-10-26：DSL V2增加版本化可选`pageObservation`（`bank-account-fields/v1`）及`expectNoErrors`操作；无此字段的原有DSL保持原语义。仅显式银行适配器的账户检查生成字段语义，Midscene负责真实定位，Playwright同时验证完整非空账户行及请求的币种/余额/状态。`expectNoErrors`读取当前页可见错误状态，不定位一个应不存在的错误标签、不导航。作者化与正式候选嵌入同一实现，均受新ReleaseIdentity约束；不增加HTTP接口、数据库迁移或运行时回退。

`openapi/hengzhun-harness-v1.yaml` 是 I2 七工具的版本化 OpenAPI 3.0.3 契约，固定包含：

## 权威边界

当前代码、SQLite 状态和真实运行证据是当前事实权威；《衡准-I10-完整链路审计文档》是完整链路和目标设计权威。本目录合同约束接口和数据形状，不能反向覆盖代码事实或审计文档目标。

I10 Flowise 正式版当前应以`contracts/mcp/hengzhun-i8.json`中的 **33 个** Streamable HTTP MCP 工具为合同基线。文件名保留`i8`仅用于历史兼容，不再代表旧14工具合同。实际运行工具数、Flowise 引用数和合同数必须通过代码与测试重新核对，不能沿用旧文档中的28或29个数字。

新增的`artifact_download_grant`只为Harness已登记制品签发短时一次性下载链接；`schedule_disable`是显式确认后的独立工具。仍不暴露通用文件系统、SQLite、Shell、浏览器或凭据读取能力。

`contracts/interaction/hengzhun-i10-response-v2.json`定义Flowise面向用户的模块化回答合同。聊天默认只展示简报、必要成果链接和唯一下一步；案例草案、脚本、诊断及证据等耐久内容由Harness以文件交付。Flowise原生附件仅为可选增强，不是权威交付链。

契约已通过无副作用静态导入校验：操作名唯一、方法与路径完整、Bearer 安全方案存在、服务地址固定为内部 Docker DNS、文件小于 2 MiB。当前 Coze Studio 公开界面仍未完成真实导入；发布和真实调用必须在 I3 关闭 `PLAT-V004` 后才能声明可用。

`openapi/hengzhun-worker-internal-v1.yaml` 1.5.0 在阶段1作者化和阶段3候选构建契约基础上，新增阶段4稳定性Claim/Completion、固定六样本、证据描述和运行时指纹Schema，共11项内部操作。它只供受控本机Worker，不导入Agent平台，也不暴露凭据、SQLite或任意执行能力。

`mcp/hengzhun-i8.json` 保留历史 I8 命名兼容，但当前 I10 运行面为33个工具；`failure_get`只返回脱敏失败封装，`repair_propose`只接受受限补丁 Schema，`decision_submit`只处理已完成对象绑定稳定性策略验证的修复提案。任何工具仍不得提供任意文件、SQL、Shell、浏览器或凭据读取能力。

人工验证方面，当前代码仍以`NONE`、`AUTO_PERSISTED_UKEY`和`EXTERNAL_CONFIRM_REQUIRED`为已实现策略。三次 Midscene 自动尝试、可见浏览器接管和验证类型自动化可行性评估属于完整审计文档中的目标设计，必须在代码、迁移、Flowise 路径和真实证据完成后再升级为合同能力。
