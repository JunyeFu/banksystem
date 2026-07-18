# Coze / HiAgent 兼容制品边界

本目录只保存通过公开界面可上传、可导入或可人工复现的制品与配置清单。Coze 是演示入口，HiAgent 是能力上限；不得通过私有管理 API、内部数据库、挂载代码或 Coze 独有能力绕过 HiAgent 限制。

三个 Skill 与十四工具 Harness 插件的登记见 `skill-catalog.yaml` 和 `plugin-catalog.yaml`。I3 至 I6 的 Agent、Knowledge Base 与 Workflow 可复现配置分别位于 `agents/`、`knowledge/` 和 `workflows/`。当前登记状态不等于平台已安装、调试或发布，真实结论只由公开界面与运行证据给出。

当前公开界面事实以 `public-ui-configuration.yaml` 和对应证据为准。I6 已通过公开界面发布十四工具插件 v0.0.10，并发布 I6 Agent 与 Knowledge Base；十四个工具逐项重新试运行通过。I6 Agent 已完成自然语言创建、查询、显式停用和再次查询的真实 Harness 闭环，本机 Coze 平台出口已关闭。公开 Coze 适配使用静态 `X-Hengzhun-Service-Token` 请求头；OpenAPI 和未来 HiAgent 的规范鉴权仍以 `Authorization: Bearer` 为主，Harness 同时校验两条受控路径。禁止使用私有 API、数据库直写或容器挂载绕过公开注册流程。
