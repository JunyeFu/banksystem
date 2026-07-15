# Agent Dev

> 迁移来源：`raw/Agent Dev.docx`

> 原文含 13 个内嵌图像；完整原件保存在 `raw/`，图像不作 OCR 推断。

Agent Dev

智能体搭建

工作流

Skill

## 表格 1

- 行 1: 功能 | 截图/demo
- 行 2: 智能体调用Skill 支持对话型智能体、规划协作型智能体编排添加Skill 支持配置Skill运行沙箱的环境变量 支持通过find-skill动态发现和注册skill，默认配置源为火山引擎的skillHub（ClawHub官方国内镜像） 支持显式（/skill-name）调用和隐式（模型自主决策）调用 | 智能体编排添加Skill 配置Skill运行沙箱环境变量 对话时显示调用Skill 对话时隐式调用Skill
- 行 3: 对话型智能体的运行上限调整 迭代次数最大调整到100轮 超时时间调整到30分钟（可运维配置） |
- 行 4: 规划协作型智能体的存储从对象存储调整为NFS |

## 表格 2

- 行 1: 功能 | 截图/demo
- 行 2: 视频生成节点支持seedance2.0模型 |
- 行 3: 图像生成节点支持seedream5.0 |

## 表格 3

- 行 1: 功能 | 截图/demo
- 行 2: 自定义Skill（空间级私有Skill） 上传zip包导入Skill，导入后自动识别frontmatter和环境变量 支持在线编辑、保存、下载Skill 支持调试、发布Skill到Skill中心 | 自定义Skill Skill编辑、保存、调试
- 行 3: Skill中心（租户级共享Skill） 公共Skill展示 支持在线预览Skill 支持收藏 支持查看我的提交和下架 | Skill中心 公共Skill预览
