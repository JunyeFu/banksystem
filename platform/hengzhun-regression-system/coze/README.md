# Coze / HiAgent 兼容制品边界

本目录只保存通过公开界面可上传、可导入或可人工复现的制品与配置清单。Coze 是演示入口，HiAgent 是能力上限；不得通过私有管理 API、内部数据库、挂载代码或 Coze 独有能力绕过 HiAgent 限制。

首版三个 Skill 与七工具 Harness 插件的登记见 `skill-catalog.yaml` 和 `plugin-catalog.yaml`。I3 Agent、Knowledge Base 与 Workflow 的可复现配置分别位于 `agents/`、`knowledge/` 和 `workflows/`。当前登记状态不等于平台已安装、调试或发布，真实结论只由 `tests/conformance/` 对应的公开界面证据给出。

当前公开界面事实以 `public-ui-configuration.yaml` 和一致性结果为准：I3 结果文件保留当时七工具调用与知识检索证据，但 2026-07-17 I4 收口复核时，当前资源库插件筛选为空，Agent 插件搜索无结果，公开创建入口也没有插件类型，说明平台配置已经漂移。I4 Agent 草稿已创建，Knowledge/Workflow 导入源已就绪，但插件和知识库尚未绑定，不能发布或冒充唯一入口可用。禁止使用私有 API、数据库直写或容器挂载绕过该阻塞。
