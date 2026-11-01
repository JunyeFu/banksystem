# 贡献指南

先阅读 [README](README.md) 和 [仓库规则](AGENTS.md)，再为具体问题创建 Issue 或 Pull Request。描述复现步骤、预期行为和实际结果，只附脱敏信息。

1. Fork 并创建范围明确的分支；不要提交环境配置、数据库、凭据、运行日志或依赖目录。
2. 核对 [API 合同](contracts/openapi)。银行账务只通过 Fineract API，不直接改核心数据库。
3. 修改实现与必要测试，遵循目录内的 AGENTS.md，保留事务、幂等和认证边界。
4. PR 写清验证命令、实际结果和未验证范围。文档运行 `python scripts/docs/validate_docs.py`；Java 使用 Java 21 测试；前端运行所属包测试与构建。

不要将合成模型测试标记为真实 BYOK 验收，不以截图代替业务结果。测试使用自己的隔离合成数据环境。任务状态以 [backlog](agent/backlog.yaml) 为准。

贡献代码按 [MPL-2.0](LICENSE) 提交；引入第三方材料需说明来源与许可证，不上传雇主内部数据或专有资料。
