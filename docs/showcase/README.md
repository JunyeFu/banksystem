---
id: DOC-PUBLIC-SHOWCASE
title: Public product showcase
document_type: reference
domain: design
status: draft
authority: evidence
version: 1.1
effective_date: 2026-11-06
owner: project-owner
---

# 展示资产与演示边界

## 2026-11-06 GitHub 首页改版

用户已明确授权将当前受控源码同步至JunyeFu/banksystem的main并更新商业风格首页；仓库现为公开，不更改可见性、不推送openMF origin、不创建Release，也不绕过RF065安全或RF057正式28项。主入口仍为当前唯一顺序及backlog，资料不另建发布路线。

本次使用浅纸色、酒红品牌标记、统一字重/间距和真实产品大图：新product-hero.svg仅为文字及向量品牌构图，非运行截图；原cover.svg保留历史。首页将核心定位、启动和四层验证放前，详细风险/资料折叠；三张既有PNG像素保持、原日期及身份不变，不伪装成当前版本的新验收。可观察执行记录不称模型隐藏思维链。

发布检查包括受控变更清单/私有路径排除、脱敏Gitleaks、相关源码/合同与治理/docs检查、封面及GitHub Markdown视觉复验、正常非force提交推送和远端main/资产回读。GitHub Actions状态按真实运行记录，不以本地测试代替，当前产品发布仍NO_GO；本地凭据、运行数据库、原始模型响应/证据和Word生成物不上传。实际提交与运行回执以Git/GitHub为准。

本地发布前检查：215个受控文件及一项已计划删除，约5MB；86个产品变更文件与既有验证快照一致。Gitleaks无泄露，源码9/依赖78/工件29/workflow16合同、RF065治理及文档检查通过。GitHub GFM排版经1440px桌面和390px移动端无界面截图查看，压缩首屏说明并前置真实结果画面；封面为1440×470自有向量，三张PNG原件未改。截图证明排版而非新业务验收，远端同步及CI仍按实际回读登记。

首页三张原始实机截图来自 RF-068 S5 报告 `606619fe-6611-4ace-99f9-9f50572c9d84`（2026-10-26），未修改页面内容或伪造运行结果。

| 公开资产 | 原始截图 | 内容 |
| --- | --- | --- |
| agent-workbench.png | live-main.png | 新对话、历史和输入入口 |
| agent-result.png | live-completed.png | 真实只读测试完成与运行引用 |
| model-settings.png | live-model-config.png | 模型配置，密钥未回显 |

原始证据保留在本机 `agent/runs/rf068-s5/`，不上传数据库、凭据、模型原始响应或整份运行目录。截图中的 opaque credential 引用不是密钥；页面只含演示环境信息。封面 SVG 是品牌排版，不是运行截图。

验收身份为 `8ff4a6bcf75ed230719dbae4f6c01aa77b351b2e699b8f1bea68c5a02bc62157`，仅适用于原 S5 范围。公开源码更新后应重新计算候选身份，不借用旧身份宣称全产品通过。详见[验收回执](../architecture/refactoring/batches/RF-068/S5-json-root-cause-20261026.md)。

## 可选管理员工具

Mifos 原生管理页不在默认拓扑，它直接访问 Fineract，仅供管理员显式排查。完成 prepare / up 后使用同一本地配置：

```powershell
docker compose --env-file .\.env -f .\postgresql\docker-compose.isolated.yml --profile admin-tools up -d --no-deps web-app
```

访问 `http://127.0.0.1:18080`。不因展示整理而启停服务，也不把该工具移出默认拓扑解释为安全审查通过。
