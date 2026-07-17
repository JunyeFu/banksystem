# Coze / HiAgent 兼容制品边界

本目录只保存通过公开界面可上传、可导入或可人工复现的制品与配置清单。Coze 是演示入口，HiAgent 是能力上限；不得通过私有管理 API、内部数据库、挂载代码或 Coze 独有能力绕过 HiAgent 限制。

首版三个 Skill 与七工具 Harness 插件的登记见 `skill-catalog.yaml` 和 `plugin-catalog.yaml`。I3 Agent、Knowledge Base 与 Workflow 的可复现配置分别位于 `agents/`、`knowledge/` 和 `workflows/`。当前登记状态不等于平台已安装、调试或发布，真实结论只由 `tests/conformance/` 对应的公开界面证据给出。

当前公开界面状态：I3 Agent 已写入主控 Prompt、绑定 Knowledge Base 但未发布；Knowledge Base 已处理为 929 Bytes、2 个分段；Workflow 已创建只有开始/结束节点的草稿；Harness 插件已通过公开 OpenAPI 导入并出现在资源库。Coze Studio 0.5.1 的插件公开编辑页随后显示“无法查看智能体”，使插件无法调试、发布或绑定 Agent。因此 Harness 七工具的本机真实调用通过仍不能替代 Coze Agent 的七工具真实调用证据。
