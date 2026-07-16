# Coze / HiAgent 平台一致性测试

本目录保存 `PLAT-V001` 至 `PLAT-V014` 的无害样例、测试步骤和脱敏结果。首批重点验证 Skill 上传、OpenAPI 参数、工具超时、同步受理、网络可达、输出预算和知识检索。

本地文件生成成功、CLI 项目存在或模型自报成功均不是平台一致性证据；必须使用公开界面或真实插件调用验证，并记录 `NOT_RUN / RUNTIME_VERIFIED / PARTIALLY_VERIFIED / PASS / FAIL / BLOCKED`。

I1 的可提交脱敏结果位于 `results/`。原始截图只保存在 `.data/evidence/`，不入库；结果文件只引用 SHA-256，不保存账号、Cookie、Token、平台内部标识或绝对敏感路径。
