# 测试

本目录保存单元、契约、集成、E2E 和平台一致性测试。I2 覆盖 SQLite 配置/迁移/完整性/并发写入/备份恢复、不可变审计、鉴权负测、七工具 HTTP 契约、幂等冲突、namespace 隔离、Artifact 路径隐藏、Schema fail-closed，以及 L0-L3 UTF-8 精确字节预算。I3 增加 Worker 独立鉴权、凭据别名、Fixture 隔离、租约、三类脱敏证据、七工具终态、会话恢复、知识检索 Hash 审计，以及 MiMo 非流式到 Coze SSE 的兼容网关测试。

平台能力只有在真实公开界面或真实调用证据满足门禁后才可标记通过；OpenAPI 本地校验不等于 Coze 已导入、发布或真实调用。结论必须结合对应 `results/PLAT-Vxxx.json` 的 `finding` 判断：I2 的 Harness 单测不能证明 Agent 发布，I3 的 `PLAT-V004`、`PLAT-V011`、`PLAT-V012` 则包含公开 UI、真实 Agent 调用和知识检索证据。
