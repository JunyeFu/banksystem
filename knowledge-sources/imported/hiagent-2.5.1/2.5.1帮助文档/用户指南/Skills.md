# Skills

> 迁移来源：`raw/Skills.docx`

> 原文含 9 个内嵌图像；完整原件保存在 `raw/`，图像不作 OCR 推断。

Skills

1. Skills概述

HiAgent平台内置官方Skills，并提供自定义Skills能力，支持Skill 管理、Agent 编排 和 Agent 运行全生命周期管理。为对话型（ChatBot）和规划协作型（AgentPro）智能体赋予专家级的任务执行能力，显著提升复杂任务的处理效率与产出质量。

2. Skills中心

Skills中心汇聚优质 Agent Skill，助力 Agent 获取更多流程化知识能力。Skills中心展示已上架的、在整个租户范围内共享的Skill。

Skills中心包含以下两个入口：

Skills中心入口1

登录HiAgent。

进入目标工作空间，在左侧导航栏选择应用 > Skills菜单。

在Skills中心页签，选择需使用的Skills。

Skills

支持在Skills中心按关键词模糊搜索，或通过收藏查看Skills。

支持对Skills收藏和取消收藏。

支持按最近上架和最受欢迎排序。

最受欢迎：根据智能体编排里直接使用数和收藏数定义，倒序排列。

最近上架：根据Skills的最近上架时间，倒序排列。

单击Skills名称进入Skills详情页，可查阅文件信息。

探索Marketplace：内嵌SkillHub Marketplace，支持一键安装技能到工作空间。

支持关键词模糊搜索Skill。

单击Skill卡片进入详情页，可查阅Skill详细介绍信息，右上角支持快速安装或下载ZIP压缩包。

Skills中心入口2

登录HiAgent。

进入目标工作空间，在左侧导航栏选择探索 > Skills中心菜单。

在Skills中心页面，选择需使用的Skills。

默认展示全部Skills、可选择我的收藏、我的提交查阅。

支持对Skills收藏和取消收藏。

支持输入Skills名称关键词模糊搜索Skills。

支持按最近上架和最受欢迎排序。

最受欢迎：根据智能体编排里直接使用数和收藏数定义，倒序排列。

最近上架：根据Skills的最近上架时间，倒序排列。

单击Skills名称进入Skills详情页，可查阅文件信息。

3. 自定义Skills

自定义Skills页签用于管理当前工作空间内的私有 Skill。支持以下两种新增方式：

本地上传：上传符合规范的.zip或 .skill包，并填写元数据。平台解析包结构，验证 SKILL.md ，如果成功将 Skill 注册到平台，成为空间级别的自定义Skill。

Skill官方规范请参考：https://agentskills.io/specification。

从Marketplace安装：跳转Marketplace，选择需要的Skill卡片，安装为空间级别的自定义Skill。

3.1 上传Skills

登录HiAgent。

进入目标工作空间，选择Skills后进入自定义Skills页面。

单击本地上传，在弹窗中选择本地上传或从Marketplace安装。

本地上传：支持 zip、skill 格式文件，单个文件不超过 10 MiB。

从Marketplace安装：跳转Marketplace，单击需要的Skill卡片进入详情页，在页面右上角单击安装。确认Skill信息后，自动安装至自定义Skills列表中。

上传成功后，Skill显示在列表中，支持发布、上架、以及管理操作。

3.2 Skills发布

Skills创建完成后，在Skills详情页执行发布操作。Skills发布后才可以被智能体使用，已发布的Skills支持更新发布。

登录HiAgent。

进入目标工作空间，在左侧导航栏选择应用 > Skills。

在自定义Skills页签，单击Skills名称进入Skills详情页。

在详情页面右上角单击发布，完成Skills发布。

支持在线编辑Skill，编辑完成后需要单击保存所有修改。在Skill调试框中选择模型进行调试，调试成功后，重新发布生效。

在页面右上角单击更新记录按钮支持查看Skills更新记录。

智能体会自动使用Skills最新发布的版本。

3.3 Skills上架

已发布的Skills支持上架到Skills中心，供其他团队空间用户查找使用。

单个上架

登录HiAgent。

进入目标工作空间，在左侧导航栏选择应用 > Skills。

选择自定义Skills页签。

在待上架Skill的操作列，单击上架图标。

确认Skill信息，单击确定即可完成Skill上架。

批量上架

登录HiAgent。

进入目标工作空间，在左侧导航栏选择应用 > Skills。

在自定义Skills页签，单击上架Skills。

选择需要上架的Skills，单击下一步。

确认Skill信息，单击确定即可完成Skill上架。

已上架的Skill支持在左侧导航栏探索 > Skills中心 > 我的提交页面中查看，支持搜索关键词查询查找使用。

Skill上架后，你只需要再次发布就可以将修改的信息同步到Skills中心。

3.4 Skills管理

编辑Skills

编辑Skill环境变量

在自定义Skills页签中，单击操作列的编辑按钮，支持编辑Skill的环境变量。

编辑Skill文件

在自定义Skills页签中，单击Skill名称。

进入Skill详情页，支持在线编辑Skill，编辑完成后需要单击保存所有修改。在Skill调试框中选择模型进行调试，调试成功后，重新发布生效。

说明：Skills被修改后，再次发布之前，智能体将继续使用之前发布版本的Skills。

删除Skills

在自定义Skills页签中，单击操作列的删除按钮。
