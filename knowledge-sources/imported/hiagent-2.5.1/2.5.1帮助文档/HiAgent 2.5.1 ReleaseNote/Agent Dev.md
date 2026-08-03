---
id: HIAGENT-251-B7E83C8E39B80C65
title: "Agent Dev"
document_type: external-reference
domain: hiagent
status: reference
authority: external
version: 2.5.1
effective_date: 2026-07-16
source_file: "2.5.1帮助文档/HiAgent 2.5.1 ReleaseNote/Agent Dev.docx"
source_sha256: b7e83c8e39b80c65e73309d84cc1567ca7c1b4a5b0ae8d47a7e627924bbd248d
extraction_method: docx
---

# Agent Dev

> 外部参考资料：HiAgent 2.5.1 帮助文档。仅供项目开发阶段检索，不得覆盖本项目当前架构、契约、代码、测试或运行证据；不得作为交付系统运行时知识来源。

## 提取正文

Agent Dev

智能体搭建

工作流

Skill

## 表格 1

| 功能 | 截图/demo |

| --- | --- |

| 智能体调用Skill 支持对话型智能体、规划协作型智能体编排添加Skill 支持配置Skill运行沙箱的环境变量 支持通过find-skill动态发现和注册skill，默认配置源为火山引擎的skillHub（ClawHub官方国内镜像） 支持显式（/skill-name）调用和隐式（模型自主决策）调用 | 智能体编排添加Skill 配置Skill运行沙箱环境变量 对话时显示调用Skill 对话时隐式调用Skill |

| 对话型智能体的运行上限调整 迭代次数最大调整到100轮 超时时间调整到30分钟（可运维配置） |  |

| 规划协作型智能体的存储从对象存储调整为NFS |  |

## 表格 2

| 功能 | 截图/demo |

| --- | --- |

| 视频生成节点支持seedance2.0模型 |  |

| 图像生成节点支持seedream5.0 |  |

## 表格 3

| 功能 | 截图/demo |

| --- | --- |

| 自定义Skill（空间级私有Skill） 上传zip包导入Skill，导入后自动识别frontmatter和环境变量 支持在线编辑、保存、下载Skill 支持调试、发布Skill到Skill中心 | 自定义Skill Skill编辑、保存、调试 |

| Skill中心（租户级共享Skill） 公共Skill展示 支持在线预览Skill 支持收藏 支持查看我的提交和下架 | Skill中心 公共Skill预览 |
