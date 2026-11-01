---
id: DOC-PUBLIC-SHOWCASE
title: Public product showcase
document_type: reference
domain: design
status: draft
authority: evidence
version: 1.0
effective_date: 2026-11-01
owner: project-owner
---

# 展示资产与演示边界

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
